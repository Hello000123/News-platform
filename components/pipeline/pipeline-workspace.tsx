"use client";

import { useEffect, useRef, useState } from "react";

import {
  FeedRequestError,
  getPipelineArticleContent,
  listPipelineArticles,
  rewritePipelineArticle,
  updatePipelineArticleStatus,
} from "@/lib/client/feeds-api";
import type {
  PipelineArticleStatus,
  PipelineArticleView,
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

export function PipelineWorkspace() {
  const [articles, setArticles] = useState<PipelineArticleView[]>([]);
  const [filter, setFilter] = useState<Filter>("new");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [contentBusy, setContentBusy] = useState(false);
  const [rewriteBusy, setRewriteBusy] = useState(false);
  const [model, setModel] = useState<SelectableModelId>("grok-4.5");
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const outputRef = useRef<HTMLTextAreaElement | null>(null);

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

  async function handleRewrite() {
    if (!selectedArticle || rewriteBusy) return;
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
        <div className="pipeline-model">
          <label className="input-label" htmlFor="pipeline-model">
            Model
          </label>
          <select
            id="pipeline-model"
            className="text-input"
            value={model}
            onChange={(event) => setModel(event.target.value as SelectableModelId)}
            disabled={rewriteBusy}
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
            Articles fetched from configured feeds will appear here. Add feeds in
            the Admin Panel or wait for the next scheduled fetch.
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
                  {article.pubDate ? ` · ${formattedDate(article.pubDate)}` : ""}
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
                    Published {formattedDate(selectedArticle.pubDate)}
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
                    <p>Fetching the source page.</p>
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
                  disabled={rewriteBusy || contentBusy || !content}
                >
                  {rewriteBusy ? "Rewriting…" : "Rewrite with AI"}
                </button>
                {output ? (
                  <>
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={handleCopy}
                      disabled={rewriteBusy}
                    >
                      Copy to Clipboard
                    </button>
                    <button
                      className="button button-quiet"
                      type="button"
                      onClick={() => handleStatusChange("approved")}
                      disabled={rewriteBusy}
                    >
                      Approve and mark done
                    </button>
                    <button
                      className="button button-danger"
                      type="button"
                      onClick={() => handleStatusChange("discarded")}
                      disabled={rewriteBusy}
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
