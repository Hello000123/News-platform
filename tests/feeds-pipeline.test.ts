import { readFile } from "node:fs/promises";

import type { D1Database } from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createFeed,
  deleteFeed,
  getFeedById,
  getPipelineArticleById,
  getPublicArticleById,
  importScrapedArticles,
  insertPipelineArticles,
  listFeeds,
  listPopularPipelineStories,
  listPipelineArticles,
  listPublicArticles,
  markPipelineArticlesMerged,
  markFeedFetchResult,
  setPipelineArticleRewritten,
  updateFeed,
  updatePipelineArticleStatus,
} from "@/lib/server/feeds/repository";
import { fetchAndIngestFeed, ingestAllFeeds } from "@/lib/server/feeds/pipeline";
import type { SourceDnsLookup } from "@/lib/server/sources/source-context";
import type { FeedView } from "@/lib/shared/feeds-contracts";

async function executeSqlScript(database: D1Database, sql: string) {
  for (const statement of sql.split(";").map((value) => value.trim()).filter(Boolean)) {
    await database.prepare(statement).run();
  }
}

const publicDns: SourceDnsLookup = vi.fn(async () => [
  { address: "93.184.216.34", family: 4 as const },
]);

const RSS_XML = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Example News</title>
    <item><title>Story one</title><link>https://example.com/one</link><description>First story</description><pubDate>Mon, 01 Jun 2026 09:00:00 GMT</pubDate></item>
    <item><title>Story two</title><link>https://example.com/two</link><description>Second story</description></item>
  </channel>
</rss>`;

function feedResponse(body: string, contentType = "application/rss+xml") {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": contentType },
  });
}

describe("feeds repository", () => {
  let miniflare: Miniflare;
  let database: D1Database;

  async function setup(): Promise<D1Database> {
    const instance = new Miniflare({
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } };",
      d1Databases: { DB: "55555555-5555-5555-5555-555555555555" },
      cf: false,
    });
    miniflare = instance;
    const db = (await instance.getD1Database("DB")) as D1Database;
    for (const migration of [
      "0001_authentication.sql",
      "0006_feeds_pipeline.sql",
      "0007_scraped_article_content.sql",
      "0008_pipeline_article_merges.sql",
    ]) {
      const sql = await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8");
      await executeSqlScript(db, sql);
    }
    await db
      .prepare(
        `INSERT INTO users (id, email, full_name, role, status, created_at, updated_at)
         VALUES ('emp-1', 'emp@example.test', 'Employee', 'employee', 'active', ?, ?)`,
      )
      .bind(1_700_000_000, 1_700_000_000)
      .run();
    return db;
  }

  afterEach(async () => {
    await miniflare?.dispose();
  });

  it("creates, lists, updates, and deletes feeds", async () => {
    database = await setup();
    const feed = await createFeed(
      database,
      { name: "World News", url: "https://feeds.example/world.xml" },
      "emp-1",
    );
    expect(feed.status).toBe("active");
    expect(feed.lastFetchedAt).toBeNull();

    const listed = await listFeeds(database);
    expect(listed).toHaveLength(1);
    expect(listed[0].name).toBe("World News");

    const updated = await updateFeed(database, feed.id, {
      name: "World News Updated",
      url: "https://feeds.example/world-v2.xml",
      status: "paused",
    });
    expect(updated?.name).toBe("World News Updated");
    expect(updated?.status).toBe("paused");

    await markFeedFetchResult(database, feed.id, {
      fetchedAt: 1_700_000_100,
      ok: false,
      error: "boom",
    });
    const afterFetch = await getFeedById(database, feed.id);
    expect(afterFetch?.lastFetchedOk).toBe(false);
    expect(afterFetch?.lastError).toBe("boom");

    const deleted = await deleteFeed(database, feed.id);
    expect(deleted).toBe(true);
    expect(await listFeeds(database)).toHaveLength(0);
  });

  it("inserts pipeline articles once by URL and tracks status transitions", async () => {
    database = await setup();
    const feed = await createFeed(
      database,
      { name: "World News", url: "https://feeds.example/world.xml" },
      "emp-1",
    );

    const items = [
      {
        title: "Story one",
        url: "https://example.com/one",
        description: "First story",
        author: null,
        pubDate: 1_780_300_800,
      },
      {
        title: "Story one",
        url: "https://example.com/one",
        description: "Duplicate",
        author: null,
        pubDate: null,
      },
    ];

    const added = await insertPipelineArticles(database, feed.id, items);
    expect(added).toBe(1);

    const articles = await listPipelineArticles(database);
    expect(articles).toHaveLength(1);
    expect(articles[0].feedName).toBe("World News");
    expect(articles[0].status).toBe("new");

    await setPipelineArticleRewritten(database, articles[0].id, "Rewritten copy.");
    const rewritten = await getPipelineArticleById(database, articles[0].id);
    expect(rewritten?.status).toBe("rewritten");
    expect(rewritten?.rewrittenText).toBe("Rewritten copy.");

    await updatePipelineArticleStatus(database, articles[0].id, "approved");
    const approved = await getPipelineArticleById(database, articles[0].id);
    expect(approved?.status).toBe("approved");

    const approvedOnly = await listPipelineArticles(database, "approved");
    expect(approvedOnly).toHaveLength(1);
  });

  it("exposes only approved articles with rewritten text on the public site", async () => {
    database = await setup();
    const feed = await createFeed(
      database,
      { name: "World News", url: "https://feeds.example/world.xml" },
      "emp-1",
    );

    await insertPipelineArticles(database, feed.id, [
      {
        title: "Approved story",
        url: "https://example.com/approved",
        description: "Published copy",
        author: "Jane Doe",
        pubDate: 1_780_394_400,
      },
      {
        title: "Rewritten only",
        url: "https://example.com/rewritten",
        description: null,
        author: null,
        pubDate: 1_780_394_500,
      },
      {
        title: "Fresh draft",
        url: "https://example.com/new",
        description: null,
        author: null,
        pubDate: 1_780_394_600,
      },
    ]);

    const articles = await listPipelineArticles(database);
    const approved = articles.find((item) => item.url.endsWith("/approved"));
    const rewritten = articles.find((item) => item.url.endsWith("/rewritten"));
    const fresh = articles.find((item) => item.url.endsWith("/new"));

    await setPipelineArticleRewritten(database, approved!.id, "Final approved copy.");
    await updatePipelineArticleStatus(database, approved!.id, "approved");
    await setPipelineArticleRewritten(database, rewritten!.id, "Rewritten but not approved.");

    const published = await listPublicArticles(database);
    expect(published).toHaveLength(1);
    expect(published[0].id).toBe(approved!.id);
    expect(published[0].feedName).toBe("World News");
    expect(published[0].rewrittenText).toBe("Final approved copy.");

    expect(await getPublicArticleById(database, approved!.id)).toMatchObject({
      id: approved!.id,
      title: "Approved story",
    });
    expect(await getPublicArticleById(database, rewritten!.id)).toBeNull();
    expect(await getPublicArticleById(database, fresh!.id)).toBeNull();
  });

  it("imports saved scraper content into the rewrite pipeline without re-scraping", async () => {
    database = await setup();
    const scraped = {
      source: "unwire",
      title: "A scraped technology story",
      url: "https://unwire.example/news/scraped-story",
      author: "News Desk",
      publishedAt: "2026-08-03T06:00:00Z",
      contentText: "The full article text captured by the external scraper.",
      imageUrl: "https://unwire.example/images/scraped-story.jpg",
    };

    expect(await importScrapedArticles(database, [scraped], "emp-1")).toEqual({
      imported: 1,
      skipped: 0,
      sources: 1,
    });

    const article = (await listPipelineArticles(database))[0];
    expect(article).toMatchObject({
      title: scraped.title,
      status: "new",
      sourceText: scraped.contentText,
      imageUrl: scraped.imageUrl,
    });

    const scraperFeed = (await listFeeds(database)).find((feed) => feed.id === article.feedId);
    expect(scraperFeed).toMatchObject({
      name: "Scraper · unwire",
      status: "paused",
    });

    expect(await importScrapedArticles(database, [scraped], "emp-1")).toEqual({
      imported: 0,
      skipped: 1,
      sources: 1,
    });
  });

  it("ranks multi-source stories once and hides merged duplicates from later batches", async () => {
    database = await setup();
    await importScrapedArticles(
      database,
      [
        {
          source: "wire-a",
          title: "OpenAI unveils GPT-5 AI model",
          url: "https://wire-a.example/gpt-5",
          author: null,
          publishedAt: "2026-08-03T06:00:00Z",
          contentText: "A".repeat(800),
          imageUrl: null,
        },
        {
          source: "wire-b",
          title: "OpenAI unveils GPT-5 model for developers",
          url: "https://wire-b.example/gpt-5",
          author: null,
          publishedAt: "2026-08-03T07:00:00Z",
          contentText: "B".repeat(400),
          imageUrl: null,
        },
        {
          source: "wire-c",
          title: "OpenAI launches GPT-5 AI platform",
          url: "https://wire-c.example/gpt-5",
          author: null,
          publishedAt: "2026-08-03T08:00:00Z",
          contentText: "C".repeat(500),
          imageUrl: null,
        },
        {
          source: "wire-d",
          title: "Typhoon warning issued for the weekend",
          url: "https://wire-d.example/weather",
          author: null,
          publishedAt: "2026-08-03T09:00:00Z",
          contentText: "Weather report.",
          imageUrl: null,
        },
      ],
      "emp-1",
    );

    const rssOnlyFeed = await createFeed(
      database,
      { name: "RSS-only source", url: "https://rss-only.example/feed.xml" },
      "emp-1",
    );
    await insertPipelineArticles(database, rssOnlyFeed.id, [
      {
        title: "Promo code story that has no saved scraper text",
        url: "https://rss-only.example/promo",
        description: "A short RSS teaser.",
        author: null,
        pubDate: 1_780_000_000,
      },
    ]);

    const rankedStories = await listPopularPipelineStories(database);
    expect(rankedStories.some((story) => story.title.includes("Promo code"))).toBe(false);
    const [topStory] = rankedStories;
    expect(topStory).toMatchObject({
      sourceCount: 3,
      reportCount: 3,
      title: "OpenAI unveils GPT-5 AI model",
    });

    const merged = await markPipelineArticlesMerged(
      database,
      topStory.articleId,
      topStory.relatedArticleIds,
    );
    expect(merged).toBe(2);
    expect((await listPipelineArticles(database, "new")).map(({ id }) => id)).toContain(
      topStory.articleId,
    );
    expect(await listPopularPipelineStories(database)).toEqual([
      expect.objectContaining({ title: "Typhoon warning issued for the weekend", reportCount: 1 }),
      expect.objectContaining({ title: "OpenAI unveils GPT-5 AI model", reportCount: 1 }),
    ]);
  }, 15_000);
});

describe("feed pipeline ingestion", () => {
  let miniflare: Miniflare;
  let database: D1Database;

  afterEach(async () => {
    await miniflare?.dispose();
  });

  async function setupWithFeed(feed: FeedView): Promise<D1Database> {
    const instance = new Miniflare({
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } };",
      d1Databases: { DB: "55555555-5555-5555-5555-555555555555" },
      cf: false,
    });
    miniflare = instance;
    const db = (await instance.getD1Database("DB")) as D1Database;
    for (const migration of [
      "0001_authentication.sql",
      "0006_feeds_pipeline.sql",
      "0007_scraped_article_content.sql",
      "0008_pipeline_article_merges.sql",
    ]) {
      const sql = await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8");
      await executeSqlScript(db, sql);
    }
    await db
      .prepare(
        `INSERT INTO users (id, email, full_name, role, status, created_at, updated_at)
         VALUES ('emp-1', 'emp@example.test', 'Employee', 'employee', 'active', ?, ?)`,
      )
      .bind(1_700_000_000, 1_700_000_000)
      .run();
    await db
      .prepare(
        `INSERT INTO feeds (
          id, name, url, status, last_fetched_at, last_fetched_ok, last_error,
          created_at, updated_at, created_by_user_id
        ) VALUES (?, ?, ?, 'active', NULL, 1, NULL, ?, ?, 'emp-1')`,
      )
      .bind(feed.id, feed.name, feed.url, 1_700_000_000, 1_700_000_000)
      .run();
    return db;
  }

  it("fetches a feed, ingests new items, and records success", async () => {
    const feed: FeedView = {
      id: "feed-1",
      name: "Example News",
      url: "https://feeds.example/news.xml",
      status: "active",
      lastFetchedAt: null,
      lastFetchedOk: true,
      lastError: null,
      createdAt: 1_700_000_000,
      updatedAt: 1_700_000_000,
    };
    database = await setupWithFeed(feed);
    const fetchMock = vi.fn(() => Promise.resolve(feedResponse(RSS_XML)));

    const result = await fetchAndIngestFeed(database, feed, {
      fetchImpl: fetchMock as unknown as typeof fetch,
      dnsLookup: publicDns,
    });

    expect(result.parsedCount).toBe(2);
    expect(result.addedCount).toBe(2);
    expect(result.feed.lastFetchedOk).toBe(true);

    const articles = await listPipelineArticles(database);
    expect(articles).toHaveLength(2);

    const storedFeed = await getFeedById(database, feed.id);
    expect(storedFeed?.lastFetchedOk).toBe(true);
    expect(storedFeed?.lastFetchedAt).not.toBeNull();
  });

  it("does not duplicate articles across repeated fetches", async () => {
    const feed: FeedView = {
      id: "feed-2",
      name: "Example News",
      url: "https://feeds.example/news.xml",
      status: "active",
      lastFetchedAt: null,
      lastFetchedOk: true,
      lastError: null,
      createdAt: 1_700_000_000,
      updatedAt: 1_700_000_000,
    };
    database = await setupWithFeed(feed);
    const fetchMock = vi.fn(() => Promise.resolve(feedResponse(RSS_XML)));

    await fetchAndIngestFeed(database, feed, {
      fetchImpl: fetchMock as unknown as typeof fetch,
      dnsLookup: publicDns,
    });
    const second = await fetchAndIngestFeed(database, feed, {
      fetchImpl: fetchMock as unknown as typeof fetch,
      dnsLookup: publicDns,
    });

    expect(second.addedCount).toBe(0);
    expect(await listPipelineArticles(database)).toHaveLength(2);
  });

  it("records failure and continues with other feeds during ingest all", async () => {
    const good: FeedView = {
      id: "feed-good",
      name: "Good",
      url: "https://feeds.example/good.xml",
      status: "active",
      lastFetchedAt: null,
      lastFetchedOk: true,
      lastError: null,
      createdAt: 1_700_000_000,
      updatedAt: 1_700_000_000,
    };
    const bad: FeedView = {
      id: "feed-bad",
      name: "Bad",
      url: "https://feeds.example/bad.xml",
      status: "active",
      lastFetchedAt: null,
      lastFetchedOk: true,
      lastError: null,
      createdAt: 1_700_000_000,
      updatedAt: 1_700_000_000,
    };
    database = await setupWithFeed(good);
    await database
      .prepare(
        `INSERT INTO feeds (
          id, name, url, status, last_fetched_at, last_fetched_ok, last_error,
          created_at, updated_at, created_by_user_id
        ) VALUES (?, ?, ?, 'active', NULL, 1, NULL, ?, ?, 'emp-1')`,
      )
      .bind(bad.id, bad.name, bad.url, 1_700_000_000, 1_700_000_000)
      .run();

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      return Promise.resolve(
        url.includes("bad")
          ? new Response("Not found", { status: 404 })
          : feedResponse(RSS_XML),
      );
    });

    const summary = await ingestAllFeeds(database, {
      fetchImpl: fetchMock as unknown as typeof fetch,
      dnsLookup: publicDns,
    });

    expect(summary.feeds).toHaveLength(2);
    expect(summary.totalAdded).toBe(2);
    expect(summary.failedCount).toBe(1);
    expect(summary.feeds.find((item) => item.feed.id === "feed-bad")).toMatchObject({
      errors: expect.any(Array),
    });

    const badStored = await getFeedById(database, bad.id);
    expect(badStored?.lastFetchedOk).toBe(false);
  });
});
