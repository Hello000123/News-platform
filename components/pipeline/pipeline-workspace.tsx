"use client";

import Link from "next/link";
import { type ChangeEvent, useEffect, useRef, useState } from "react";

import {
  FeedRequestError,
  getPipelineArticleContent,
  importScrapedArticles,
  listPipelineArticles,
  listPopularPipelineStories,
  rewritePipelineArticle,
  updatePipelineArticlePost,
} from "@/lib/client/feeds-api";
import type {
  PipelineArticleStatus,
  PipelineArticleView,
  ScrapedArticleInput,
} from "@/lib/shared/feeds-contracts";
import type { SelectableModelId } from "@/lib/shared/models";
import { POPULAR_PIPELINE_REWRITE_INSTRUCTION } from "@/lib/shared/pipeline-rewrite-instructions";

type Filter = PipelineArticleStatus | "all";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "new", label: "New" },
  { value: "rewritten", label: "Rewritten" },
  { value: "approved", label: "Approved" },
  { value: "discarded", label: "Discarded" },
  { value: "all", label: "All" },
];

function formattedDate(timestamp: number | null) {
  if (!timestamp) return "Unknown date";
  return new Intl.DateTimeFormat("en-HK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(timestamp * 1_000));
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function previewableImageUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function rewrittenHeadline(value: string | null) {
  return value?.split(/\n\s*\n/u)[0]?.trim() || "Untitled post";
}

function scrapedArticleInput(value: unknown, index: number): ScrapedArticleInput {
  if (!value || typeof value !== "object") {
    throw new Error(`Article ${index + 1} is not a valid scraper record.`);
  }

  const record = value as Record<string, unknown>;
  const source = optionalText(record.source);
  const title = optionalText(record.title);
  const url = optionalText(record.url);
  const contentText = optionalText(record.content_text)?.slice(0, 50_000);
  if (!source || !title || !url || !contentText) {
    throw new Error(`Article ${index + 1} is missing source, title, URL, or scraped text.`);
  }

  return {
    source,
    title,
    url,
    author: optionalText(record.author),
    publishedAt: optionalText(record.published_at),
    contentText,
    imageUrl: optionalText(record.image_url),
  };
}

interface PipelineWorkspaceProps {
  initialModel: SelectableModelId;
}

export function PipelineWorkspace({ initialModel }: PipelineWorkspaceProps) {
  const [articles, setArticles] = useState<PipelineArticleView[]>([]);
  const [filter, setFilter] = useState<Filter>("new");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [contentBusy, setContentBusy] = useState(false);
  const [rewriteBusy, setRewriteBusy] = useState(false);
  const [rewritePublishing, setRewritePublishing] = useState(false);
  const [postBusy, setPostBusy] = useState(false);
  const [popularRewriteBusy, setPopularRewriteBusy] = useState(false);
  const [popularRewriteProgress, setPopularRewriteProgress] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [model, setModel] = useState<SelectableModelId>(initialModel);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [imagePreviewFailed, setImagePreviewFailed] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const outputRef = useRef<HTMLTextAreaElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const selectedArticle = articles.find((article) => article.id === selectedId) ?? null;
  const imagePreviewUrl = previewableImageUrl(imageUrl);
  const postHasChanges = Boolean(
    selectedArticle &&
      ((output?.trim() ?? "") !== (selectedArticle.rewrittenText?.trim() ?? "") ||
        imageUrl.trim() !== (selectedArticle.imageUrl ?? "").trim()),
  );
  const actionBusy = rewriteBusy || popularRewriteBusy || postBusy;

  useEffect(() => {
    let cancelled = false;
    listPipelineArticles(filter === "all" ? undefined : filter)
      .then((result) => {
        if (cancelled) return;
        setArticles(result.articles);
        setSelectedId((current) => {
          if (current && result.articles.some((article) => article.id === current)) {
            return current;
          }
          return result.articles[0]?.id ?? null;
        });
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(
            error instanceof FeedRequestError
              ? error.message
              : "Pipeline articles could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter, refreshVersion]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setContent(null);
      setOutput(null);
      setImageUrl("");
      setImagePreviewFailed(false);
      setValidation(null);
      setErrorMessage("");
      setContentBusy(true);
      getPipelineArticleContent(selectedId)
        .then((result) => {
          if (cancelled) return;
          setContent(result.content);
          setArticles((current) =>
            current.map((article) =>
              article.id === result.article.id ? result.article : article,
            ),
          );
          setImageUrl(result.article.imageUrl ?? "");
          if (result.article.rewrittenText) setOutput(result.article.rewrittenText);
        })
        .catch((error) => {
          if (!cancelled) {
            setErrorMessage(
              error instanceof FeedRequestError
                ? error.message
                : "Article content could not be loaded.",
            );
          }
        })
        .finally(() => {
          if (!cancelled) setContentBusy(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  function changeFilter(value: Filter) {
    if (value === filter) return;
    setNotice(null);
    setErrorMessage("");
    setLoading(true);
    setFilter(value);
  }

  async function handleScrapedImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || importBusy || postBusy) return;

    setImportBusy(true);
    setErrorMessage("");
    setNotice(null);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!Array.isArray(parsed)) {
        throw new Error("Choose the scraper's combined.json export.");
      }
      const result = await importScrapedArticles(
        parsed.map((item, index) => scrapedArticleInput(item, index)),
      );
      setNotice(
        `Imported ${result.imported} scraped article${result.imported === 1 ? "" : "s"}` +
          (result.skipped ? `; ${result.skipped} already existed.` : "."),
      );
      setLoading(true);
      setFilter("new");
      setRefreshVersion((current) => current + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The scraper export could not be imported.");
    } finally {
      event.target.value = "";
      setImportBusy(false);
    }
  }

  async function handleRewrite(publish = false) {
    if (!selectedArticle || actionBusy) return;
    setRewriteBusy(true);
    setRewritePublishing(publish);
    setErrorMessage("");
    setNotice(null);
    try {
      if (
        publish &&
        imageUrl.trim() !== (selectedArticle.imageUrl ?? "").trim()
      ) {
        await updatePipelineArticlePost(selectedArticle.id, {
          imageUrl: imageUrl.trim() || null,
        });
      }
      const result = await rewritePipelineArticle(selectedArticle.id, { model, publish });
      setOutput(result.finalText);
      setImageUrl(result.article.imageUrl ?? "");
      setValidation(
        result.validation.status === "passed"
          ? "Validation passed on the first attempt."
          : "Validation passed after a focused correction.",
      );
      setArticles((current) =>
        current.map((article) =>
          article.id === result.article.id ? result.article : article,
        ),
      );
      setNotice(
        publish
          ? `“${rewrittenHeadline(result.finalText)}” is now live on the homepage.`
          : "The rewrite is ready. Edit the copy or featured image, then publish when it is ready.",
      );
      if (publish) {
        setLoading(true);
        setFilter("approved");
        setRefreshVersion((current) => current + 1);
      }
      if (outputRef.current) outputRef.current.scrollIntoView({ behavior: "smooth" });
    } catch (error) {
      setErrorMessage(
        error instanceof FeedRequestError
          ? error.message
          : "The article could not be rewritten.",
      );
    } finally {
      setRewriteBusy(false);
      setRewritePublishing(false);
    }
  }

  async function handlePopularRewrite() {
    if (popularRewriteBusy || rewriteBusy || importBusy || postBusy) return;

    setPopularRewriteBusy(true);
    setPopularRewriteProgress(null);
    setErrorMessage("");
    setNotice(null);
    try {
      const { stories } = await listPopularPipelineStories();
      if (stories.length === 0) {
        setNotice(
          "There are no saved scraper reports ready yet. Import the scraper's combined.json export, then run the top-five batch.",
        );
        return;
      }

      let rewrittenCount = 0;
      let mergedCount = 0;
      const failedTitles: string[] = [];
      for (const [index, story] of stories.entries()) {
        setPopularRewriteProgress(`Rewriting ${index + 1}/${stories.length}: ${story.title}`);
        try {
          await rewritePipelineArticle(story.articleId, {
            model,
            outputLanguage: "traditional_chinese",
            relatedArticleIds: story.relatedArticleIds,
            instruction: POPULAR_PIPELINE_REWRITE_INSTRUCTION,
          });
          rewrittenCount += 1;
          mergedCount += Math.max(story.reportCount - 1, 0);
        } catch (error) {
          failedTitles.push(
            error instanceof FeedRequestError ? `${story.title}: ${error.message}` : story.title,
          );
        }
      }

      setLoading(true);
      setFilter("rewritten");
      setRefreshVersion((current) => current + 1);
      if (rewrittenCount > 0) {
        setNotice(
          `Rewrote ${rewrittenCount} of ${stories.length} popular story group${stories.length === 1 ? "" : "s"} in Traditional Chinese` +
            (mergedCount ? ` and combined ${mergedCount} duplicate report${mergedCount === 1 ? "" : "s"}` : "") +
            ". Review each draft before approval.",
        );
      }
      if (failedTitles.length > 0) {
        setErrorMessage(
          `Could not rewrite ${failedTitles.length} story group${failedTitles.length === 1 ? "" : "s"}: ${failedTitles.join(" · ")}`,
        );
      }
    } catch (error) {
      setErrorMessage(
        error instanceof FeedRequestError
          ? error.message
          : "The popular-story batch could not be prepared.",
      );
    } finally {
      setPopularRewriteProgress(null);
      setPopularRewriteBusy(false);
    }
  }

  async function handlePostSave(publish: boolean) {
    if (!selectedArticle || postBusy || rewriteBusy || popularRewriteBusy) return;
    const rewrittenText = output?.trim();
    if (publish && !rewrittenText) {
      setErrorMessage("Rewrite or add the final article copy before publishing it.");
      return;
    }
    setPostBusy(true);
    setErrorMessage("");
    setNotice(null);
    try {
      const result = await updatePipelineArticlePost(selectedArticle.id, {
        ...(rewrittenText ? { rewrittenText } : {}),
        imageUrl: imageUrl.trim() || null,
        ...(publish ? { status: "approved" as const } : {}),
      });
      setArticles((current) =>
        current.map((article) =>
          article.id === result.article.id ? result.article : article,
        ),
      );
      setOutput(result.article.rewrittenText);
      setImageUrl(result.article.imageUrl ?? "");
      setNotice(
        publish
          ? result.article.status === selectedArticle.status
            ? `“${rewrittenHeadline(result.article.rewrittenText)}” was updated on the homepage.`
            : `“${rewrittenHeadline(result.article.rewrittenText)}” was published to the homepage.`
          : "Post changes saved.",
      );
      if (filter !== "all" && filter !== result.article.status) {
        setLoading(true);
        setFilter(result.article.status);
        setRefreshVersion((current) => current + 1);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof FeedRequestError
          ? error.message
          : "The post could not be saved.",
      );
    } finally {
      setPostBusy(false);
    }
  }

  async function handleDiscard() {
    if (!selectedArticle || actionBusy) return;
    setPostBusy(true);
    setErrorMessage("");
    setNotice(null);
    try {
      const wasPublished = selectedArticle.status === "approved";
      const result = await updatePipelineArticlePost(selectedArticle.id, {
        status: "discarded",
      });
      setArticles((current) =>
        current.map((article) =>
          article.id === result.article.id ? result.article : article,
        ),
      );
      setNotice(
        wasPublished
          ? `“${rewrittenHeadline(result.article.rewrittenText)}” was removed from the homepage.`
          : `“${result.article.title}” was discarded.`,
      );
      if (filter !== "all" && filter !== "discarded") {
        setLoading(true);
        setFilter("discarded");
        setRefreshVersion((current) => current + 1);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof FeedRequestError
          ? error.message
          : "The article could not be discarded.",
      );
    } finally {
      setPostBusy(false);
    }
  }

  function handleCopy() {
    if (!output) return;
    void navigator.clipboard.writeText(output).then(() => {
      setNotice("The rewritten article was copied to your clipboard.");
    });
  }

  return (
    <section className="pipeline-workspace" aria-busy={loading}>
      <div className="pipeline-toolbar">
        <div className="employee-filter" aria-label="Filter pipeline articles">
          {FILTERS.map((option) => (
            <button
              type="button"
              className={filter === option.value ? "employee-filter-active" : ""}
              aria-pressed={filter === option.value}
              key={option.value}
              onClick={() => changeFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="pipeline-import">
          <input
            ref={importInputRef}
            className="sr-only"
            id="scraped-news-import"
            type="file"
            accept="application/json,.json"
            onChange={handleScrapedImport}
            disabled={importBusy || popularRewriteBusy || postBusy}
          />
          <button
            className="button button-secondary"
            type="button"
            onClick={() => importInputRef.current?.click()}
            disabled={importBusy || popularRewriteBusy || postBusy}
          >
            {importBusy ? "Importing scraper export…" : "Import scraper JSON"}
          </button>
        </div>
        <div className="pipeline-auto-rewrite">
          <button
            className="button button-primary"
            type="button"
            onClick={handlePopularRewrite}
            disabled={popularRewriteBusy || rewriteBusy || importBusy || postBusy}
          >
            {popularRewriteBusy ? "Rewriting top stories…" : "Rewrite top 5 in Chinese"}
          </button>
          <p>
            Groups related reports, prioritises independent source coverage, and leaves all drafts for human approval.
          </p>
        </div>
        <div className="pipeline-model">
          <label className="input-label" htmlFor="pipeline-model">
            Model
          </label>
          <select
            id="pipeline-model"
            className="text-input"
            value={model}
            onChange={(event) => setModel(event.target.value as SelectableModelId)}
            disabled={actionBusy}
          >
            <option value="grok-4.5">Grok 4.5</option>
            <option value="deepseek-v4-pro">DeepSeek V4 Pro</option>
          </select>
        </div>
      </div>

      {notice ? (
        <div className="auth-alert auth-alert-success" role="status">
          {notice}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="auth-alert auth-alert-error" role="alert">
          {errorMessage}
        </div>
      ) : null}

      {popularRewriteProgress ? (
        <div className="auth-alert auth-alert-success" role="status">
          {popularRewriteProgress}
        </div>
      ) : null}

      {loading ? (
        <div className="loading-panel" role="status">
          <span className="spinner spinner-dark" aria-hidden="true" />
          <div>
            <strong>Loading pipeline</strong>
            <p>Retrieving the latest scraped articles.</p>
          </div>
        </div>
      ) : null}

      {!loading && articles.length === 0 ? (
        <div className="employee-empty">
          <strong>
            No {filter === "all" ? "" : `${filter} `}articles
          </strong>
          <p>
            Import the scraper&apos;s <code>combined.json</code> export, or add a feed in
            the Admin Panel and wait for the next scheduled fetch.
          </p>
        </div>
      ) : null}

      {!loading && articles.length > 0 ? (
        <div className="pipeline-layout">
          <div className="pipeline-list">
            {articles.map((article) => (
              <button
                className={
                  article.id === selectedId ? "pipeline-list-item-active" : ""
                }
                type="button"
                key={article.id}
                onClick={() => {
                  setSelectedId(article.id);
                  setNotice(null);
                }}
              >
                <span className="pipeline-list-item-title">{article.title}</span>
                <span className="pipeline-list-item-meta">
                  {article.feedName}
                  {article.status !== "new" && article.updatedAt
                    ? ` · ${formattedDate(article.updatedAt)}`
                    : article.pubDate
                      ? ` · ${formattedDate(article.pubDate)}`
                      : ""}
                </span>
                <span className={`status-badge status-${article.status}`}>
                  {article.status}
                </span>
              </button>
            ))}
          </div>

          {selectedArticle ? (
            <article className="pipeline-detail" aria-live="polite">
              <div className="pipeline-detail-heading">
                <div>
                  <span className="section-kicker">{selectedArticle.feedName}</span>
                  <h2>{selectedArticle.title}</h2>
                  <p>
                    {selectedArticle.author ? `${selectedArticle.author} · ` : ""}
                    {selectedArticle.pubDate
                      ? `Published ${formattedDate(selectedArticle.pubDate)}`
                      : ""}
                    {selectedArticle.status !== "new" && selectedArticle.updatedAt
                      ? ` · ${selectedArticle.status === "rewritten" ? "Rewritten" : selectedArticle.status === "approved" ? "Approved" : "Discarded"} ${formattedDate(selectedArticle.updatedAt)}`
                      : ""}
                  </p>
                </div>
                <span className={`status-badge status-${selectedArticle.status}`}>
                  {selectedArticle.status}
                </span>
              </div>

              <div className="pipeline-post-grid">
                <section className="pipeline-source-panel" aria-labelledby="pipeline-source-heading">
                  <div className="pipeline-panel-heading">
                    <div>
                      <span className="pipeline-step">01</span>
                      <div>
                        <p>Source material</p>
                        <h3 id="pipeline-source-heading">Review the reporting</h3>
                      </div>
                    </div>
                    <a href={selectedArticle.url} target="_blank" rel="noopener noreferrer">
                      Open source <span aria-hidden="true">↗</span>
                    </a>
                  </div>

                  {contentBusy ? (
                    <div className="loading-panel" role="status">
                      <span className="spinner spinner-dark" aria-hidden="true" />
                      <div>
                        <strong>Loading article content</strong>
                        <p>Retrieving the saved source text.</p>
                      </div>
                    </div>
                  ) : content ? (
                    <details className="pipeline-source-disclosure" open={!output}>
                      <summary>Read saved source content</summary>
                      <div className="pipeline-source-copy" tabIndex={0}>
                        {content}
                      </div>
                    </details>
                  ) : (
                    <p className="pipeline-panel-empty">No saved source text is available.</p>
                  )}
                </section>

                <section
                  className="pipeline-composer"
                  aria-labelledby="pipeline-composer-heading"
                  aria-busy={actionBusy}
                >
                  <div className="pipeline-panel-heading pipeline-composer-heading">
                    <div>
                      <span className="pipeline-step">02</span>
                      <div>
                        <p>Post composer</p>
                        <h3 id="pipeline-composer-heading">Prepare the homepage story</h3>
                      </div>
                    </div>
                    <span className={selectedArticle.status === "approved" ? "pipeline-live-state" : "pipeline-draft-state"}>
                      <span aria-hidden="true" />
                      {selectedArticle.status === "approved" ? "Live" : "Draft"}
                    </span>
                  </div>

                  <div className="pipeline-image-editor">
                    <div className="pipeline-image-preview">
                      {imagePreviewUrl && !imagePreviewFailed ? (
                        // Arbitrary editor-supplied hosts cannot be safely enumerated in Next image remotePatterns.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={imagePreviewUrl}
                          alt="Featured image preview"
                          width={960}
                          height={540}
                          loading="lazy"
                          onError={() => setImagePreviewFailed(true)}
                        />
                      ) : (
                        <div className="pipeline-image-empty">
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M4 5.5h16v13H4zM7 15l3.2-3.5 2.5 2.7 1.8-2 2.5 2.8M8.2 9h.1" />
                          </svg>
                          <span>
                            {imageUrl.trim()
                              ? "This image cannot be previewed"
                              : "Add a featured image for this post"}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="pipeline-image-fields">
                      <label className="input-label" htmlFor="pipeline-image-url">
                        Featured image URL
                      </label>
                      <input
                        id="pipeline-image-url"
                        className="text-input"
                        type="url"
                        inputMode="url"
                        placeholder="https://example.com/news-image.jpg"
                        value={imageUrl}
                        aria-invalid={Boolean(imageUrl.trim() && !imagePreviewUrl)}
                        disabled={actionBusy}
                        onChange={(event) => {
                          setImageUrl(event.target.value);
                          setImagePreviewFailed(false);
                        }}
                      />
                      <p className="field-help">
                        Paste a public HTTPS image URL. It will appear on the homepage and article page.
                      </p>
                      {imageUrl ? (
                        <button
                          className="pipeline-text-action"
                          type="button"
                          onClick={() => {
                            setImageUrl("");
                            setImagePreviewFailed(false);
                          }}
                          disabled={actionBusy}
                        >
                          Remove featured image
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="pipeline-ai-row">
                    <div>
                      <p>AI rewrite</p>
                      <span>
                        Generate an editable draft, or publish it immediately after validation.
                      </span>
                    </div>
                    <div>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => handleRewrite(false)}
                        disabled={actionBusy || contentBusy || !content}
                      >
                        {rewriteBusy && !rewritePublishing ? "Rewriting…" : output ? "Rewrite again" : "Rewrite draft"}
                      </button>
                      <button
                        className="button button-primary"
                        type="button"
                        onClick={() => handleRewrite(true)}
                        disabled={actionBusy || contentBusy || !content}
                      >
                        {rewriteBusy && rewritePublishing ? "Rewriting & publishing…" : "Rewrite & publish"}
                      </button>
                    </div>
                  </div>

                  {validation ? (
                    <div className="pipeline-validation" role="status">
                      <svg viewBox="0 0 20 20" aria-hidden="true">
                        <path d="m5 10 3 3 7-7" />
                      </svg>
                      <span>{validation}</span>
                    </div>
                  ) : null}

                  {output !== null ? (
                    <div className="pipeline-output">
                      <div className="pipeline-field-heading">
                        <div>
                          <label className="input-label" htmlFor="pipeline-rewritten-output">
                            Post copy
                          </label>
                          <p className="field-help">
                            The first paragraph becomes the public headline. Verify every fact before publishing.
                          </p>
                        </div>
                        <span>{output.length.toLocaleString("en-US")} / 50,000</span>
                      </div>
                      <textarea
                        id="pipeline-rewritten-output"
                        ref={outputRef}
                        className="output-textarea pipeline-post-textarea"
                        value={output}
                        maxLength={50_000}
                        disabled={actionBusy}
                        onChange={(event) => setOutput(event.target.value)}
                        spellCheck
                      />
                    </div>
                  ) : (
                    <div className="pipeline-copy-empty">
                      <p>No rewritten post yet</p>
                      <span>Generate a draft above to unlock editing and homepage publishing.</span>
                    </div>
                  )}

                  <div className="pipeline-publish-bar">
                    <div>
                      <strong>
                        {selectedArticle.status === "approved"
                          ? "This post is visible on the homepage"
                          : "Ready to publish?"}
                      </strong>
                      <span>
                        {postHasChanges
                          ? "You have unsaved post changes."
                          : selectedArticle.status === "approved"
                            ? "The saved version is live."
                            : "Save a draft or send it to the public site."}
                      </span>
                    </div>
                    <div className="pipeline-actions">
                      {output ? (
                        <button
                          className="button button-quiet"
                          type="button"
                          onClick={handleCopy}
                          disabled={actionBusy}
                        >
                          Copy
                        </button>
                      ) : null}
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => handlePostSave(false)}
                        disabled={actionBusy || !postHasChanges}
                      >
                        {postBusy ? "Saving…" : "Save changes"}
                      </button>
                      <button
                        className="button button-primary"
                        type="button"
                        onClick={() => handlePostSave(true)}
                        disabled={actionBusy || !output?.trim()}
                      >
                        {postBusy
                          ? "Publishing…"
                          : selectedArticle.status === "approved"
                            ? "Update homepage"
                            : "Publish to homepage"}
                      </button>
                      {selectedArticle.status === "approved" ? (
                        <Link
                          className="button button-quiet"
                          href={`/news/${encodeURIComponent(selectedArticle.id)}`}
                          target="_blank"
                        >
                          View live post
                        </Link>
                      ) : null}
                      <button
                        className="button button-danger"
                        type="button"
                        onClick={handleDiscard}
                        disabled={actionBusy}
                      >
                        {selectedArticle.status === "approved" ? "Unpublish" : "Discard"}
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            </article>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
