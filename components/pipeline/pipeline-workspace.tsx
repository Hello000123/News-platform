"use client";

import Link from "next/link";
import { type ChangeEvent, useEffect, useRef, useState } from "react";

import {
  FeedRequestError,
  getPipelineArticleContent,
  importScrapedArticles,
  listPipelineArticles,
  listPopularPipelineStories,
  removePipelineArticleImage,
  rewritePipelineArticle,
  uploadPipelineArticleImage,
  updatePipelineArticlePost,
} from "@/lib/client/feeds-api";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MEGABYTES } from "@/lib/shared/file-upload";
import type {
  NewsCategory,
  PipelineArticleStatus,
  PipelineArticleView,
  PipelineRewriteSourceOrigin,
  ScrapedArticleInput,
} from "@/lib/shared/feeds-contracts";
import type { SelectableModelId } from "@/lib/shared/models";
import { NEWS_CATEGORIES } from "@/lib/shared/news-categories";
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

function isManagedImageUrl(value: string) {
  return /^\/api\/news-images\/[0-9a-f]{32}(?:\?v=\d+)?$/u.test(value.trim());
}

function previewableImageUrl(value: string) {
  const trimmed = value.trim();
  if (isManagedImageUrl(trimmed)) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function splitPostCopy(value: string | null) {
  const paragraphs = (value ?? "")
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  return {
    headline: paragraphs[0] ?? "",
    body: paragraphs.slice(1).join("\n\n"),
  };
}

function composePostCopy(headline: string, body: string) {
  if (!headline && !body) return "";
  return body ? `${headline}\n\n${body}` : headline;
}

function rewrittenHeadline(value: string | null) {
  return splitPostCopy(value).headline || "Untitled post";
}

function rewriteErrorMessage(error: FeedRequestError) {
  return error.debugId
    ? `${error.message} Debug ID: ${error.debugId}.`
    : error.message;
}

function createRewriteDebugBatchId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `top5-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const TOP_FIVE_REQUEST_ATTEMPTS = 2;

function shouldRetryPopularRewrite(error: unknown) {
  if (!(error instanceof FeedRequestError)) return true;
  if (error.retryable === false) return false;
  if (error.retryable === true) return true;
  if (error.code === "INVALID_SERVER_RESPONSE") return true;
  return (
    error.status === undefined ||
    error.status === 408 ||
    error.status === 429 ||
    error.status >= 500
  );
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
  const [contentOrigin, setContentOrigin] =
    useState<PipelineRewriteSourceOrigin | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [postHeadline, setPostHeadline] = useState("");
  const [postBody, setPostBody] = useState("");
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
  const [imageUploadBusy, setImageUploadBusy] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [localImagePreview, setLocalImagePreview] = useState<string | null>(null);
  const [category, setCategory] = useState<NewsCategory | "">("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const outputRef = useRef<HTMLTextAreaElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const selectedArticle = articles.find((article) => article.id === selectedId) ?? null;
  const hasManagedImage = isManagedImageUrl(imageUrl);
  const imagePreviewUrl = localImagePreview ?? previewableImageUrl(imageUrl);
  const composedPostCopy = composePostCopy(postHeadline, postBody);
  const postCopyReady = Boolean(postHeadline.trim() && postBody.trim());
  const postHasChanges = Boolean(
    selectedArticle &&
      (composedPostCopy.trim() !== (selectedArticle.rewrittenText?.trim() ?? "") ||
        imageUrl.trim() !== (selectedArticle.imageUrl ?? "").trim() ||
        category !== (selectedArticle.category ?? "")),
  );
  const actionBusy =
    contentBusy || rewriteBusy || popularRewriteBusy || postBusy || imageUploadBusy;

  useEffect(() => {
    return () => {
      if (localImagePreview) URL.revokeObjectURL(localImagePreview);
    };
  }, [localImagePreview]);

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
      setContentOrigin(null);
      setOutput(null);
      setPostHeadline("");
      setPostBody("");
      setImageUrl("");
      setImagePreviewFailed(false);
      setImageUploadError(null);
      setLocalImagePreview(null);
      setCategory("");
      setValidation(null);
      setErrorMessage("");
      setContentBusy(true);
      getPipelineArticleContent(selectedId)
        .then((result) => {
          if (cancelled) return;
          setContent(result.content);
          setContentOrigin(result.sourceOrigin);
          setArticles((current) =>
            current.map((article) =>
              article.id === result.article.id ? result.article : article,
            ),
          );
          setImageUrl(result.article.imageUrl ?? "");
          setCategory(result.article.category ?? "");
          const loadedPost = splitPostCopy(result.article.rewrittenText);
          setPostHeadline(loadedPost.headline);
          setPostBody(loadedPost.body);
          setOutput(result.article.rewrittenText ?? "");
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
      const validArticles: ScrapedArticleInput[] = [];
      const rejectedArticles: string[] = [];
      parsed.forEach((item, index) => {
        try {
          validArticles.push(scrapedArticleInput(item, index));
        } catch (error) {
          rejectedArticles.push(
            error instanceof Error ? error.message : `Article ${index + 1} is invalid.`,
          );
        }
      });
      if (validArticles.length === 0) {
        throw new Error(rejectedArticles[0] ?? "The scraper export contains no valid articles.");
      }
      const result = await importScrapedArticles(validArticles);
      const noticeParts = [
        `Imported ${result.imported} scraped article${result.imported === 1 ? "" : "s"}`,
      ];
      if (result.skipped) noticeParts.push(`${result.skipped} already existed`);
      if (rejectedArticles.length) {
        noticeParts.push(
          `${rejectedArticles.length} invalid record${rejectedArticles.length === 1 ? " was" : "s were"} skipped`,
        );
      }
      setNotice(`${noticeParts.join("; ")}.`);
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
      if (publish) {
        const pendingPostMetadata: {
          imageUrl?: string | null;
          category?: NewsCategory | null;
        } = {};
        if (imageUrl.trim() !== (selectedArticle.imageUrl ?? "").trim()) {
          pendingPostMetadata.imageUrl = imageUrl.trim() || null;
        }
        if (category !== (selectedArticle.category ?? "")) {
          pendingPostMetadata.category = category || null;
        }
        if (Object.keys(pendingPostMetadata).length > 0) {
          await updatePipelineArticlePost(selectedArticle.id, pendingPostMetadata);
        }
      }
      const result = await rewritePipelineArticle(selectedArticle.id, { model, publish });
      const rewrittenPost = splitPostCopy(result.finalText);
      setPostHeadline(rewrittenPost.headline);
      setPostBody(rewrittenPost.body);
      setOutput(result.finalText);
      setImageUrl(result.article.imageUrl ?? "");
      setCategory(result.article.category ?? "");
      setValidation(
        result.validation.status === "passed"
          ? "Validation passed on the first attempt."
          : result.validation.attempts === 3
            ? "Validation passed after two focused corrections."
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
          ? rewriteErrorMessage(error)
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
          "There are no new feed or scraper reports ready to rewrite. Fetch the feeds or import the scraper's combined.json export, then run the top-five batch.",
        );
        return;
      }

      let rewrittenCount = 0;
      let mergedCount = 0;
      const failedTitles: string[] = [];
      const debugBatchId = createRewriteDebugBatchId();
      for (const [index, story] of stories.entries()) {
        let rewritten = false;
        let finalError: unknown = null;
        for (let requestAttempt = 1; requestAttempt <= TOP_FIVE_REQUEST_ATTEMPTS; requestAttempt += 1) {
          setPopularRewriteProgress(
            `${requestAttempt === 1 ? "Rewriting" : "Retrying"} ${index + 1}/${stories.length}: ${story.title}`,
          );
          try {
            await rewritePipelineArticle(story.articleId, {
              model,
              outputLanguage: "traditional_chinese",
              lengthOption: "more_detailed",
              relatedArticleIds: story.relatedArticleIds,
              instruction: POPULAR_PIPELINE_REWRITE_INSTRUCTION,
              debugBatchId,
            });
            rewritten = true;
            break;
          } catch (error) {
            finalError = error;
            if (
              requestAttempt >= TOP_FIVE_REQUEST_ATTEMPTS ||
              !shouldRetryPopularRewrite(error)
            ) {
              break;
            }
          }
        }
        if (rewritten) {
          rewrittenCount += 1;
          mergedCount += Math.max(story.relatedArticleIds.length - 1, 0);
        } else {
          failedTitles.push(
            finalError instanceof FeedRequestError
              ? `${story.title}: ${rewriteErrorMessage(finalError)}`
              : story.title,
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
            (failedTitles.length
              ? `. ${failedTitles.length} group${failedTitles.length === 1 ? "" : "s"} failed; see the error below.`
              : ".") +
            " Review each draft before approval.",
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
    if (
      !selectedArticle ||
      contentBusy ||
      postBusy ||
      rewriteBusy ||
      popularRewriteBusy
    ) return;
    const rewrittenText = composePostCopy(postHeadline, postBody).trim();
    if (publish && !postCopyReady) {
      setErrorMessage("Add both a public headline and article body before publishing it.");
      return;
    }
    setPostBusy(true);
    setErrorMessage("");
    setNotice(null);
    try {
      const result = await updatePipelineArticlePost(selectedArticle.id, {
        ...(rewrittenText ? { rewrittenText } : {}),
        imageUrl: imageUrl.trim() || null,
        category: category || null,
        ...(publish ? { status: "approved" as const } : {}),
      });
      setArticles((current) =>
        current.map((article) =>
          article.id === result.article.id ? result.article : article,
        ),
      );
      setOutput(result.article.rewrittenText);
      const savedPost = splitPostCopy(result.article.rewrittenText);
      setPostHeadline(savedPost.headline);
      setPostBody(savedPost.body);
      setImageUrl(result.article.imageUrl ?? "");
      setCategory(result.article.category ?? "");
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
    const copy = composePostCopy(postHeadline, postBody).trim();
    if (!copy) return;
    void navigator.clipboard.writeText(copy).then(() => {
      setNotice("The rewritten article was copied to your clipboard.");
    });
  }

  async function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !selectedArticle || actionBusy) return;
    setImageUploadError(null);
    setErrorMessage("");
    setNotice(null);
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setImageUploadError("Choose a PNG, JPEG, or WebP photo.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setImageUploadError(`Choose a photo smaller than ${MAX_UPLOAD_MEGABYTES} MB.`);
      event.target.value = "";
      return;
    }

    const preview = URL.createObjectURL(file);
    setLocalImagePreview(preview);
    setImagePreviewFailed(false);
    setImageUploadBusy(true);
    try {
      const result = await uploadPipelineArticleImage(selectedArticle.id, file);
      setArticles((current) =>
        current.map((article) =>
          article.id === result.article.id ? result.article : article,
        ),
      );
      setImageUrl(result.imageUrl);
      setLocalImagePreview(null);
      setNotice(`“${file.name}” is uploaded and saved as this post’s featured photo.`);
    } catch (error) {
      setLocalImagePreview(null);
      setImageUploadError(
        error instanceof FeedRequestError
          ? error.message
          : "The photo could not be uploaded.",
      );
    } finally {
      event.target.value = "";
      setImageUploadBusy(false);
    }
  }

  async function handleImageRemove() {
    if (!selectedArticle || actionBusy) return;
    setImageUploadError(null);
    setImagePreviewFailed(false);
    setLocalImagePreview(null);
    if (!isManagedImageUrl(imageUrl)) {
      setImageUrl("");
      return;
    }

    setImageUploadBusy(true);
    try {
      const result = await removePipelineArticleImage(selectedArticle.id);
      setArticles((current) =>
        current.map((article) =>
          article.id === result.article.id ? result.article : article,
        ),
      );
      setImageUrl("");
      setNotice("The uploaded featured photo was removed from this post.");
    } catch (error) {
      setImageUploadError(
        error instanceof FeedRequestError
          ? error.message
          : "The photo could not be removed.",
      );
    } finally {
      setImageUploadBusy(false);
    }
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
          <a
            className="pipeline-debug-link"
            href="/api/pipeline/rewrite-debug?limit=50"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open rewrite debug log <span aria-hidden="true">↗</span>
          </a>
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
                      <summary>
                        {contentOrigin === "rss_preview"
                          ? "Read RSS preview (incomplete)"
                          : contentOrigin === "live_page"
                            ? "Read retrieved full source content"
                            : "Read saved full source content"}
                      </summary>
                      {contentOrigin === "rss_preview" ? (
                        <p className="pipeline-source-notice" role="note">
                          The publisher page could not provide a complete body. This is only the
                          feed preview and will not be cached as full source content.
                        </p>
                      ) : null}
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

                  <div className="pipeline-post-identity">
                    <div>
                      <label className="input-label" htmlFor="pipeline-public-headline">
                        Public headline
                      </label>
                      <input
                        id="pipeline-public-headline"
                        className="text-input"
                        type="text"
                        maxLength={1_000}
                        value={postHeadline}
                        disabled={actionBusy || output === null}
                        onChange={(event) => {
                          setPostHeadline(event.target.value);
                          setOutput(composePostCopy(event.target.value, postBody));
                        }}
                      />
                      <p className="field-help">This headline appears on the homepage, category page, and article page.</p>
                    </div>
                    <div>
                      <label className="input-label" htmlFor="pipeline-post-category">
                        Public category
                      </label>
                      <select
                        id="pipeline-post-category"
                        className="text-input"
                        value={category}
                        disabled={actionBusy}
                        onChange={(event) => setCategory(event.target.value as NewsCategory | "")}
                      >
                        <option value="">Homepage only</option>
                        {NEWS_CATEGORIES.map((option) => (
                          <option value={option.value} key={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <p className="field-help">Choose where this post is archived after publication.</p>
                    </div>
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
                      <div className="pipeline-photo-upload">
                        <input
                          ref={imageInputRef}
                          className="sr-only"
                          id="pipeline-image-upload"
                          type="file"
                          accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                          disabled={actionBusy}
                          onChange={handleImageUpload}
                        />
                        <label className="input-label" htmlFor="pipeline-image-upload">
                          Upload your own photo
                        </label>
                        <button
                          className="button button-secondary"
                          type="button"
                          onClick={() => imageInputRef.current?.click()}
                          disabled={actionBusy}
                        >
                          {imageUploadBusy ? "Uploading photo…" : imageUrl ? "Replace photo" : "Choose photo"}
                        </button>
                        <p className="field-help">PNG, JPEG, or WebP; up to {MAX_UPLOAD_MEGABYTES} MB. The photo is stored with the post.</p>
                        {imageUploadError ? <p className="pipeline-image-error" role="alert">{imageUploadError}</p> : null}
                      </div>
                      <details className="pipeline-image-url-disclosure">
                        <summary>Or use a public image URL</summary>
                        <div>
                          <label className="input-label" htmlFor="pipeline-image-url">
                            Featured image URL
                          </label>
                          <input
                            id="pipeline-image-url"
                            className="text-input"
                            type="url"
                            inputMode="url"
                            placeholder="https://example.com/news-image.jpg"
                            value={hasManagedImage ? "" : imageUrl}
                            aria-invalid={Boolean(imageUrl.trim() && !imagePreviewUrl)}
                            disabled={actionBusy || hasManagedImage}
                            onChange={(event) => {
                              setImageUrl(event.target.value);
                              setLocalImagePreview(null);
                              setImagePreviewFailed(false);
                              setImageUploadError(null);
                            }}
                          />
                          {hasManagedImage ? (
                            <p className="field-help">
                              Remove the uploaded photo before switching to a public image URL.
                            </p>
                          ) : null}
                        </div>
                      </details>
                      {imageUrl ? (
                        <button
                          className="pipeline-text-action"
                          type="button"
                          onClick={handleImageRemove}
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
                            Article body
                          </label>
                          <p className="field-help">
                            Edit the finished report below. Verify every fact before publishing.
                          </p>
                        </div>
                        <span>{composedPostCopy.length.toLocaleString("en-US")} / 50,000</span>
                      </div>
                      <textarea
                        id="pipeline-rewritten-output"
                        ref={outputRef}
                        className="output-textarea pipeline-post-textarea"
                        value={postBody}
                        maxLength={49_000}
                        disabled={actionBusy}
                        onChange={(event) => {
                          setPostBody(event.target.value);
                          setOutput(composePostCopy(postHeadline, event.target.value));
                        }}
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
                      {composedPostCopy.trim() ? (
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
                        disabled={actionBusy || !postCopyReady}
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
