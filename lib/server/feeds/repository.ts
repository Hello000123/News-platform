import type { D1Database } from "@cloudflare/workers-types";

import { createId, nowInSeconds } from "@/lib/server/auth/crypto";
import { AppError } from "@/lib/server/errors";
import type { FeedItem } from "@/lib/server/feeds/rss-parser";
import type {
  FeedInput,
  FeedStatus,
  FeedUpdateInput,
  FeedView,
  PipelineArticleStatus,
  PipelineArticleView,
} from "@/lib/shared/feeds-contracts";

interface FeedRow {
  id: string;
  name: string;
  url: string;
  status: FeedStatus;
  last_fetched_at: number | null;
  last_fetched_ok: number;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

interface PipelineArticleRow {
  id: string;
  feed_id: string;
  feed_name: string;
  title: string;
  url: string;
  description: string | null;
  author: string | null;
  pub_date: number | null;
  status: PipelineArticleStatus;
  rewritten_text: string | null;
  created_at: number;
  updated_at: number;
}

function mapFeed(row: FeedRow): FeedView {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    status: row.status,
    lastFetchedAt: row.last_fetched_at,
    lastFetchedOk: row.last_fetched_ok === 1,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapArticle(row: PipelineArticleRow): PipelineArticleView {
  return {
    id: row.id,
    feedId: row.feed_id,
    feedName: row.feed_name,
    title: row.title,
    url: row.url,
    description: row.description,
    author: row.author,
    pubDate: row.pub_date,
    status: row.status,
    rewrittenText: row.rewritten_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const FEED_SELECT = `
  SELECT id, name, url, status, last_fetched_at, last_fetched_ok, last_error, created_at, updated_at
  FROM feeds
`;

const ARTICLE_SELECT = `
  SELECT
    article.id,
    article.feed_id,
    feed.name AS feed_name,
    article.title,
    article.url,
    article.description,
    article.author,
    article.pub_date,
    article.status,
    article.rewritten_text,
    article.created_at,
    article.updated_at
  FROM pipeline_articles AS article
  INNER JOIN feeds AS feed ON feed.id = article.feed_id
`;

export async function listFeeds(database: D1Database) {
  const result = await database
    .prepare(`${FEED_SELECT} ORDER BY name COLLATE NOCASE`)
    .all<FeedRow>();
  return result.results.map(mapFeed);
}

export async function listActiveFeeds(database: D1Database) {
  const result = await database
    .prepare(`${FEED_SELECT} WHERE status = 'active' ORDER BY name COLLATE NOCASE`)
    .all<FeedRow>();
  return result.results.map(mapFeed);
}

export async function getFeedById(database: D1Database, id: string) {
  const row = await database
    .prepare(`${FEED_SELECT} WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<FeedRow>();
  return row ? mapFeed(row) : null;
}

export async function createFeed(
  database: D1Database,
  input: FeedInput,
  createdByUserId: string,
) {
  const id = createId();
  const now = nowInSeconds();
  try {
    await database
      .prepare(
        `INSERT INTO feeds (
          id, name, url, status, last_fetched_at, last_fetched_ok, last_error,
          created_at, updated_at, created_by_user_id
        ) VALUES (?, ?, ?, 'active', NULL, 1, NULL, ?, ?, ?)`,
      )
      .bind(id, input.name, input.url, now, now, createdByUserId)
      .run();
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE/iu.test(error.message)) {
      throw new AppError(
        "DUPLICATE_FEED_URL",
        "A feed with this URL already exists.",
        409,
      );
    }
    throw error;
  }
  const created = await getFeedById(database, id);
  if (!created) {
    throw new AppError("FEED_CREATE_FAILED", "The feed could not be created.", 500);
  }
  return created;
}

export async function updateFeed(
  database: D1Database,
  id: string,
  input: FeedUpdateInput,
) {
  const existing = await getFeedById(database, id);
  if (!existing) {
    throw new AppError("FEED_NOT_FOUND", "The feed was not found.", 404);
  }
  try {
    await database
      .prepare(
        `UPDATE feeds
         SET name = ?, url = ?, status = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(input.name, input.url, input.status, nowInSeconds(), id)
      .run();
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE/iu.test(error.message)) {
      throw new AppError(
        "DUPLICATE_FEED_URL",
        "A feed with this URL already exists.",
        409,
      );
    }
    throw error;
  }
  return getFeedById(database, id);
}

export async function deleteFeed(database: D1Database, id: string) {
  const result = await database.prepare("DELETE FROM feeds WHERE id = ?").bind(id).run();
  return result.meta.changes > 0;
}

export async function markFeedFetchResult(
  database: D1Database,
  feedId: string,
  values: { fetchedAt: number; ok: boolean; error: string | null },
) {
  await database
    .prepare(
      `UPDATE feeds
       SET last_fetched_at = ?, last_fetched_ok = ?, last_error = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      values.fetchedAt,
      values.ok ? 1 : 0,
      values.error,
      values.fetchedAt,
      feedId,
    )
    .run();
}

export async function listPipelineArticles(
  database: D1Database,
  status?: PipelineArticleStatus,
) {
  const statement = status
    ? database
        .prepare(
          `${ARTICLE_SELECT}
           WHERE article.status = ?
           ORDER BY article.created_at DESC
           LIMIT 200`,
        )
        .bind(status)
    : database.prepare(
        `${ARTICLE_SELECT}
         ORDER BY article.created_at DESC
         LIMIT 200`,
      );
  const result = await statement.all<PipelineArticleRow>();
  return result.results.map(mapArticle);
}

export async function listPublicArticles(database: D1Database, limit = 100) {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
  const result = await database
    .prepare(
      `${ARTICLE_SELECT}
       WHERE article.status = 'approved'
         AND article.rewritten_text IS NOT NULL
         AND length(trim(article.rewritten_text)) > 0
       ORDER BY COALESCE(article.pub_date, article.created_at) DESC
       LIMIT ?`,
    )
    .bind(safeLimit)
    .all<PipelineArticleRow>();
  return result.results.map(mapArticle);
}

export async function getPublicArticleById(database: D1Database, id: string) {
  const row = await database
    .prepare(
      `${ARTICLE_SELECT}
       WHERE article.id = ?
         AND article.status = 'approved'
         AND article.rewritten_text IS NOT NULL
         AND length(trim(article.rewritten_text)) > 0
       LIMIT 1`,
    )
    .bind(id)
    .first<PipelineArticleRow>();
  return row ? mapArticle(row) : null;
}

export async function getPipelineArticleById(database: D1Database, id: string) {
  const row = await database
    .prepare(`${ARTICLE_SELECT} WHERE article.id = ? LIMIT 1`)
    .bind(id)
    .first<PipelineArticleRow>();
  return row ? mapArticle(row) : null;
}

export async function getPipelineArticleByUrl(database: D1Database, url: string) {
  const row = await database
    .prepare(`${ARTICLE_SELECT} WHERE article.url = ? COLLATE NOCASE LIMIT 1`)
    .bind(url)
    .first<PipelineArticleRow>();
  return row ? mapArticle(row) : null;
}

export async function insertPipelineArticles(
  database: D1Database,
  feedId: string,
  items: readonly FeedItem[],
) {
  const now = nowInSeconds();
  let addedCount = 0;
  const statements = [];
  const seenUrls = new Set<string>();
  for (const item of items) {
    const normalizedUrl = item.url.toLowerCase();
    if (seenUrls.has(normalizedUrl)) continue;
    seenUrls.add(normalizedUrl);
    const existing = await getPipelineArticleByUrl(database, item.url);
    if (existing) continue;
    const articleId = createId();
    statements.push(
      database
        .prepare(
          `INSERT INTO pipeline_articles (
            id, feed_id, title, url, description, author, pub_date,
            status, rewritten_text, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'new', NULL, ?, ?)`,
        )
        .bind(
          articleId,
          feedId,
          item.title,
          item.url,
          item.description,
          item.author,
          item.pubDate,
          now,
          now,
        ),
    );
    addedCount += 1;
  }
  if (statements.length > 0) await database.batch(statements);
  return addedCount;
}

export async function updatePipelineArticleStatus(
  database: D1Database,
  articleId: string,
  status: PipelineArticleStatus,
) {
  const result = await database
    .prepare(
      `UPDATE pipeline_articles
       SET status = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(status, nowInSeconds(), articleId)
    .run();
  return result.meta.changes > 0;
}

export async function setPipelineArticleRewritten(
  database: D1Database,
  articleId: string,
  rewrittenText: string,
) {
  const result = await database
    .prepare(
      `UPDATE pipeline_articles
       SET status = 'rewritten', rewritten_text = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(rewrittenText, nowInSeconds(), articleId)
    .run();
  return result.meta.changes > 0;
}
