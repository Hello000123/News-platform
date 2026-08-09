"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  AuthRequestError,
  generateEmployeeClientSummary,
  getEmployeeClientDetail,
} from "@/lib/client/auth-api";
import type { ClientDetailView } from "@/lib/shared/client-summaries";

interface ClientDetailProps {
  clientId: string;
}

function formattedDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-HK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(timestamp * 1_000));
}

function languageLabel(language: string | null) {
  if (language === "traditional_chinese") return "Traditional Chinese";
  if (language === "source") return "Source language";
  return "Not recorded";
}

function categoryLabel(category: string | null) {
  if (category === "social-enterprise") return "Social enterprise";
  if (category === "technology") return "Technology";
  return "Uncategorised";
}

export function ClientDetail({ clientId }: ClientDetailProps) {
  const [detail, setDetail] = useState<ClientDetailView | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getEmployeeClientDetail(clientId, page)
      .then(({ detail: nextDetail }) => {
        if (!cancelled) setDetail(nextDetail);
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(
            error instanceof AuthRequestError
              ? error.message
              : "The client details could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, page]);

  async function generateSummary() {
    setGenerating(true);
    setErrorMessage("");
    setNotice("");
    try {
      const { summary } = await generateEmployeeClientSummary(clientId);
      setDetail((current) => (current ? { ...current, summary } : current));
      setNotice(
        summary.insufficientInformation
          ? "Summary generation completed, but the available evidence was insufficient for a complete company profile."
          : "The company summary was generated and saved.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof AuthRequestError
          ? error.message
          : "The company summary could not be generated.",
      );
    } finally {
      setGenerating(false);
    }
  }

  if (loading && !detail) {
    return (
      <div className="loading-panel" role="status">
        <span className="spinner spinner-dark" aria-hidden="true" />
        <div>
          <strong>Loading client details</strong>
          <p>Retrieving the client profile and published news.</p>
        </div>
      </div>
    );
  }

  if (errorMessage && !detail) {
    return (
      <div className="auth-alert auth-alert-error" role="alert">
        {errorMessage}
      </div>
    );
  }

  if (!detail) return null;

  const { client, summary, publishedNews } = detail;
  return (
    <div className="client-detail" aria-busy={loading || generating}>
      <section className="client-detail-profile editorial-card">
        <div className="client-detail-profile-heading">
          <div>
            <div className="section-kicker">Client account</div>
            <h1>{client.fullName}</h1>
            <a href={`mailto:${client.email}`}>{client.email}</a>
          </div>
          <span className={`status-badge status-${client.status}`}>
            {client.status === "setup_pending" ? "Setup pending" : client.status}
          </span>
        </div>
        <dl className="employee-details-list">
          <div>
            <dt>Company</dt>
            <dd>{client.company || "Not provided"}</dd>
          </div>
          <div>
            <dt>Department</dt>
            <dd>{client.department || "Not provided"}</dd>
          </div>
          <div>
            <dt>Job title</dt>
            <dd>{client.jobTitle || "Not provided"}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{client.phone || "Not provided"}</dd>
          </div>
          <div>
            <dt>Account created</dt>
            <dd>{formattedDate(client.createdAt)}</dd>
          </div>
        </dl>
      </section>

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

      <section className="client-summary-card editorial-card" aria-labelledby="client-summary-title">
        <div className="client-section-heading">
          <div>
            <div className="section-kicker">Evidence-bound AI profile</div>
            <h2 id="client-summary-title">Company summary</h2>
          </div>
          <button
            className="button button-primary"
            type="button"
            disabled={generating}
            onClick={() => void generateSummary()}
          >
            {generating
              ? "Generating summary…"
              : summary
                ? "Regenerate Summary"
                : "Generate Summary"}
          </button>
        </div>

        {!summary ? (
          <div className="employee-empty">
            <strong>No company summary yet</strong>
            <p>Generate a structured summary from the client profile and published news.</p>
          </div>
        ) : (
          <>
            {summary.insufficientInformation ? (
              <div className="client-summary-insufficient" role="note">
                <strong>Insufficient information</strong>
                <p>
                  The available profile and published-news evidence does not support a complete
                  company summary. Missing fields remain unclassified instead of being invented.
                </p>
              </div>
            ) : null}
            <dl className="client-summary-fields">
              <div>
                <dt>Company or organisation</dt>
                <dd>{summary.companyName || "Not established"}</dd>
              </div>
              <div>
                <dt>Company type or industry</dt>
                <dd>{summary.companyType || "Unknown / Unclassified"}</dd>
              </div>
              <div>
                <dt>Products or services</dt>
                <dd>
                  {summary.productsOrServices.length > 0
                    ? summary.productsOrServices.join(", ")
                    : "Not established"}
                </dd>
              </div>
              <div className="client-summary-description">
                <dt>Short description</dt>
                <dd>{summary.shortDescription || "Not established"}</dd>
              </div>
              <div className="client-summary-description">
                <dt>Recurring published-news subjects</dt>
                <dd>
                  {summary.recurringSubjects.length > 0
                    ? summary.recurringSubjects.join(", ")
                    : "No supported recurring subjects"}
                </dd>
              </div>
            </dl>
            <p className="client-summary-meta">
              Generated {formattedDate(summary.generatedAt)} by {summary.generatedBy.fullName}
              {summary.modelId ? ` using ${summary.modelId}` : " without an AI request"}. Evidence
              included {summary.sourceArticleCount.toLocaleString("en-US")} owned published article
              {summary.sourceArticleCount === 1 ? "" : "s"}.
            </p>
          </>
        )}
      </section>

      <section className="client-news-card editorial-card" aria-labelledby="client-news-title">
        <div className="client-section-heading">
          <div>
            <div className="section-kicker">Publication record</div>
            <h2 id="client-news-title">Published News</h2>
          </div>
          <strong>{publishedNews.totalItems.toLocaleString("en-US")} articles</strong>
        </div>
        <p className="client-news-ownership-note">
          Publisher ownership is recorded from this feature&apos;s deployment onward. Earlier
          articles are not assigned retroactively because their publisher cannot be verified.
        </p>

        {publishedNews.items.length === 0 ? (
          <div className="employee-empty">
            <strong>No verified published news</strong>
            <p>No live articles are currently linked to this client as the authenticated publisher.</p>
          </div>
        ) : (
          <div className="client-news-table-wrap">
            <table className="client-news-table">
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Publication date</th>
                  <th scope="col">Status</th>
                  <th scope="col">Language</th>
                  <th scope="col">Category</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {publishedNews.items.map((article) => (
                  <tr key={article.id}>
                    <td>{article.title}</td>
                    <td>{formattedDate(article.publicationDate)}</td>
                    <td><span className="status-badge status-approved">Published</span></td>
                    <td>{languageLabel(article.language)}</td>
                    <td>{categoryLabel(article.category)}</td>
                    <td>
                      <Link className="button button-secondary" href={article.href}>
                        Open article
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {publishedNews.totalPages > 1 ? (
          <nav className="client-news-pagination" aria-label="Published news pages">
            <button
              className="button button-secondary"
              type="button"
              disabled={loading || publishedNews.page <= 1}
              onClick={() => {
                setLoading(true);
                setErrorMessage("");
                setPage((current) => Math.max(1, current - 1));
              }}
            >
              Previous
            </button>
            <span>
              Page {publishedNews.page} of {publishedNews.totalPages}
            </span>
            <button
              className="button button-secondary"
              type="button"
              disabled={loading || publishedNews.page >= publishedNews.totalPages}
              onClick={() => {
                setLoading(true);
                setErrorMessage("");
                setPage((current) => current + 1);
              }}
            >
              Next
            </button>
          </nav>
        ) : null}
      </section>
    </div>
  );
}
