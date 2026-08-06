"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";

import {
  FeedRequestError,
  getPipelineArticleContent,
  importScrapedArticles,
  listPipelineArticles,
  listPopularPipelineStories,
  rewritePipelineArticle,
  updatePipelineArticleStatus,
} from "@/lib/client/feeds-api";
import type {
  PipelineArticleStatus,
  PipelineArticleView,
  ScrapedArticleInput,
} from "@/lib/shared/feeds-contracts";
import type { SelectableModelId } from "@/lib/shared/models";

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
  const [popularRewriteBusy, setPopularRewriteBusy] = useState(false);
  const [popularRewriteProgress, setPopularRewriteProgress] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [model, setModel] = useState<SelectableModelId>(initialModel);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const outputRef = useRef<HTMLTextAreaElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const selectedArticle = articles.find((article) => article.id === selectedId) ?? null;

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
      setValidation(null);
      setErrorMessage("");
      setContentBusy(true);
      getPipelineArticleContent(selectedId)
        .then((result) => {
          if (cancelled) return;
          setContent(result.content);
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
    if (!file || importBusy) return;

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

  async function handleRewrite() {
    if (!selectedArticle || rewriteBusy || popularRewriteBusy) return;
    setRewriteBusy(true);
    setErrorMessage("");
    setNotice(null);
    try {
      const result = await rewritePipelineArticle(selectedArticle.id, { model });
      setOutput(result.finalText);
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
      if (outputRef.current) outputRef.current.scrollIntoView({ behavior: "smooth" });
    } catch (error) {
      setErrorMessage(
        error instanceof FeedRequestError
          ? error.message
          : "The article could not be rewritten.",
      );
    } finally {
      setRewriteBusy(false);
    }
  }

  async function handlePopularRewrite() {
    if (popularRewriteBusy || rewriteBusy || importBusy) return;

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
            instruction:
              "Create one clear Traditional Chinese news report for human editorial review. Use only supported, non-conflicting facts from the clustered reports.",
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

  async function handleStatusChange(status: "approved" | "discarded") {
    if (!selectedArticle) return;
    setErrorMessage("");
    setNotice(null);
    try {
      const result = await updatePipelineArticleStatus(selectedArticle.id, status);
      setArticles((current) =>
        current.map((article) =>
          article.id === result.article.id ? result.article : article,
        ),
      );
      setNotice(
        status === "approved"
          ? `"${result.article.title}" was approved and marked done.`
          : `"${result.article.title}" was discarded.`,
      );
      setLoading(true);
      setRefreshVersion((current) => current + 1);
    } catch (error) {
      setErrorMessage(
        error instanceof FeedRequestError
          ? error.message
          : "The article status could not be updated.",
      );
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
            disabled={importBusy || popularRewriteBusy}
          />
          <button
            className="button button-secondary"
            type="button"
            onClick={() => importInputRef.current?.click()}
            disabled={importBusy || popularRewriteBusy}
          >
            {importBusy ? "Importing scraper export…" : "Import scraper JSON"}
          </button>
        </div>
        <div className="pipeline-auto-rewrite">
          <button
            className="button button-primary"
            type="button"
            onClick={handlePopularRewrite}
            disabled={popularRewriteBusy || rewriteBusy || importBusy}
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
            disabled={rewriteBusy || popularRewriteBusy}
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

              {contentBusy ? (
                <div className="loading-panel" role="status">
                  <span className="spinner spinner-dark" aria-hidden="true" />
                  <div>
                    <strong>Loading article content</strong>
                    <p>Loading the saved scraper content.</p>
                  </div>
                </div>
              ) : content ? (
                <div className="pipeline-content">
                  <label className="input-label" htmlFor="pipeline-article-content">
                    Source content
                  </label>
                  <textarea
                    id="pipeline-article-content"
                    className="output-textarea"
                    value={content}
                    readOnly
                    spellCheck={false}
                  />
                </div>
              ) : null}

              <div className="pipeline-actions">
                <button
                  className="button button-primary"
                  type="button"
                  onClick={handleRewrite}
                  disabled={rewriteBusy || popularRewriteBusy || contentBusy || !content}
                >
                  {rewriteBusy ? "Rewriting…" : "Rewrite with AI"}
                </button>
                {output ? (
                  <>
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={handleCopy}
                      disabled={rewriteBusy || popularRewriteBusy}
                    >
                      Copy to Clipboard
                    </button>
                    <button
                      className="button button-quiet"
                      type="button"
                      onClick={() => handleStatusChange("approved")}
                      disabled={rewriteBusy || popularRewriteBusy}
                    >
                      Approve and mark done
                    </button>
                    <button
                      className="button button-danger"
                      type="button"
                      onClick={() => handleStatusChange("discarded")}
                      disabled={rewriteBusy || popularRewriteBusy}
                    >
                      Discard
                    </button>
                  </>
                ) : null}
              </div>

              {validation ? (
                <div className="auth-alert auth-alert-success" role="status">
                  {validation}
                </div>
              ) : null}

              {output ? (
                <div className="pipeline-output">
                  <label className="input-label" htmlFor="pipeline-rewritten-output">
                    Rewritten article — verify every name, date, number,
                    quotation, and attribution before approval.
                  </label>
                  <textarea
                    id="pipeline-rewritten-output"
                    ref={outputRef}
                    className="output-textarea"
                    value={output}
                    readOnly
                    spellCheck={false}
                  />
                </div>
              ) : null}
            </article>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
