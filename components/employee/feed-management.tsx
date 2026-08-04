"use client";

import { useEffect, useState, type FormEvent } from "react";

import {
  createFeed,
  deleteFeed,
  FeedRequestError,
  fetchAllFeeds,
  fetchFeed,
  listFeeds,
  updateFeed,
} from "@/lib/client/feeds-api";
import type { FeedView } from "@/lib/shared/feeds-contracts";

function formattedDate(timestamp: number | null) {
  if (!timestamp) return "Never";
  return new Intl.DateTimeFormat("en-HK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(timestamp * 1_000));
}

interface EditingState {
  id: string;
  name: string;
  url: string;
}

export function FeedManagement() {
  const [feeds, setFeeds] = useState<FeedView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [editing, setEditing] = useState<EditingState | null>(null);

  function loadFeeds() {
    setLoading(true);
    setErrorMessage("");
    listFeeds()
      .then((result) => setFeeds(result.feeds))
      .catch((error) => {
        setErrorMessage(
          error instanceof FeedRequestError
            ? error.message
            : "Feed settings could not be loaded.",
        );
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      loadFeeds();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAddFeed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrorMessage("");
    setNotice(null);
    try {
      const result = await createFeed({ name: name.trim(), url: url.trim() });
      setFeeds((current) => [...current, result.feed]);
      setName("");
      setUrl("");
      setNotice(`Feed "${result.feed.name}" was added.`);
    } catch (error) {
      setErrorMessage(
        error instanceof FeedRequestError
          ? error.message
          : "The feed could not be added.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || busy) return;
    setBusy(true);
    setErrorMessage("");
    setNotice(null);
    try {
      const result = await updateFeed(editing.id, {
        name: editing.name.trim(),
        url: editing.url.trim(),
        status: "active",
      });
      setFeeds((current) =>
        current.map((feed) => (feed.id === result.feed.id ? result.feed : feed)),
      );
      setEditing(null);
      setNotice("Feed updated.");
    } catch (error) {
      setErrorMessage(
        error instanceof FeedRequestError
          ? error.message
          : "The feed could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleStatus(feed: FeedView) {
    if (busy) return;
    setBusy(true);
    setErrorMessage("");
    setNotice(null);
    try {
      const nextStatus = feed.status === "active" ? "paused" : "active";
      const result = await updateFeed(feed.id, {
        name: feed.name,
        url: feed.url,
        status: nextStatus,
      });
      setFeeds((current) =>
        current.map((item) => (item.id === result.feed.id ? result.feed : item)),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof FeedRequestError
          ? error.message
          : "The feed could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(feed: FeedView) {
    if (busy) return;
    if (!window.confirm(`Remove feed "${feed.name}" and its pipeline articles?`)) return;
    setBusy(true);
    setErrorMessage("");
    setNotice(null);
    try {
      await deleteFeed(feed.id);
      setFeeds((current) => current.filter((item) => item.id !== feed.id));
      setNotice(`Feed "${feed.name}" was removed.`);
    } catch (error) {
      setErrorMessage(
        error instanceof FeedRequestError
          ? error.message
          : "The feed could not be removed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleFetch(feed: FeedView) {
    if (busy) return;
    setBusy(true);
    setErrorMessage("");
    setNotice(null);
    try {
      const result = await fetchFeed(feed.id);
      setFeeds((current) =>
        current.map((item) =>
          item.id === result.result.feed.id ? result.result.feed : item,
        ),
      );
      setNotice(
        result.result.addedCount > 0
          ? `Fetched ${result.result.parsedCount} items from "${feed.name}", added ${result.result.addedCount} new.`
          : `Fetched ${result.result.parsedCount} items from "${feed.name}" (no new articles).`,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof FeedRequestError
          ? error.message
          : "The feed could not be fetched.",
      );
      loadFeeds();
    } finally {
      setBusy(false);
    }
  }

  async function handleFetchAll() {
    if (busy) return;
    setBusy(true);
    setErrorMessage("");
    setNotice(null);
    try {
      const result = await fetchAllFeeds();
      setFeeds(
        result.feeds.map((item) => item.feed),
      );
      setNotice(
        result.failedCount > 0
          ? `Fetched all feeds: ${result.totalParsed} items, ${result.totalAdded} new, ${result.failedCount} failed.`
          : `Fetched all feeds: ${result.totalParsed} items, ${result.totalAdded} new.`,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof FeedRequestError
          ? error.message
          : "Feeds could not be fetched.",
      );
      loadFeeds();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="feed-management" aria-labelledby="feed-management-heading">
      <div className="feed-management-heading">
        <div>
          <div className="section-kicker">RSS ingestion</div>
          <h2 id="feed-management-heading">News feeds</h2>
          <p>
            Feeds are polled on a schedule and manually. New items flow into the
            pipeline for rewriting and human review.
          </p>
        </div>
        <button
          className="button button-secondary"
          type="button"
          onClick={handleFetchAll}
          disabled={busy || feeds.length === 0}
        >
          Fetch all feeds now
        </button>
      </div>

      <form className="feed-add-form" onSubmit={handleAddFeed}>
        <div className="feed-add-fields">
          <label className="input-label" htmlFor="feed-name">
            Feed name
          </label>
          <input
            id="feed-name"
            className="text-input"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Reuters World News"
            maxLength={120}
            required
          />
          <label className="input-label" htmlFor="feed-url">
            Feed URL
          </label>
          <input
            id="feed-url"
            className="text-input"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/rss.xml"
            maxLength={2048}
            required
          />
        </div>
        <button className="button button-primary" type="submit" disabled={busy}>
          Add feed
        </button>
      </form>

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
            <strong>Loading feeds</strong>
            <p>Retrieving the configured news feeds.</p>
          </div>
        </div>
      ) : null}

      {!loading && !errorMessage && feeds.length === 0 ? (
        <div className="employee-empty">
          <strong>No feeds configured</strong>
          <p>Add an RSS or Atom feed above to start the pipeline.</p>
        </div>
      ) : null}

      {!loading && feeds.length > 0 ? (
        <div className="feed-list">
          {feeds.map((feed) =>
            editing?.id === feed.id ? (
              <form
                className="feed-edit-row"
                key={feed.id}
                onSubmit={handleSaveEdit}
              >
                <div className="feed-edit-fields">
                  <input
                    className="text-input"
                    type="text"
                    value={editing.name}
                    onChange={(event) =>
                      setEditing({ ...editing, name: event.target.value })
                    }
                    maxLength={120}
                    required
                  />
                  <input
                    className="text-input"
                    type="url"
                    value={editing.url}
                    onChange={(event) =>
                      setEditing({ ...editing, url: event.target.value })
                    }
                    maxLength={2048}
                    required
                  />
                </div>
                <div className="feed-row-actions">
                  <button className="button button-primary" type="submit" disabled={busy}>
                    Save
                  </button>
                  <button
                    className="button button-quiet"
                    type="button"
                    onClick={() => setEditing(null)}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <article className="feed-row" key={feed.id}>
                <div className="feed-row-main">
                  <div className="feed-row-title">
                    <h2>{feed.name}</h2>
                    <span className={`status-badge status-${feed.status}`}>
                      {feed.status}
                    </span>
                    {!feed.lastFetchedOk ? (
                      <span className="status-badge status-rejected">
                        Last fetch failed
                      </span>
                    ) : null}
                  </div>
                  <a href={feed.url} target="_blank" rel="noreferrer">
                    {feed.url}
                  </a>
                  <small>
                    Last fetched {formattedDate(feed.lastFetchedAt)}
                    {feed.lastError ? ` · ${feed.lastError}` : ""}
                  </small>
                </div>
                <div className="feed-row-actions">
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => handleFetch(feed)}
                    disabled={busy}
                  >
                    Fetch now
                  </button>
                  <button
                    className="button button-quiet"
                    type="button"
                    onClick={() =>
                      setEditing({ id: feed.id, name: feed.name, url: feed.url })
                    }
                    disabled={busy}
                  >
                    Edit
                  </button>
                  <button
                    className="button button-quiet"
                    type="button"
                    onClick={() => handleToggleStatus(feed)}
                    disabled={busy}
                  >
                    {feed.status === "active" ? "Pause" : "Resume"}
                  </button>
                  <button
                    className="button button-danger"
                    type="button"
                    onClick={() => handleDelete(feed)}
                    disabled={busy}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ),
          )}
        </div>
      ) : null}
    </section>
  );
}
