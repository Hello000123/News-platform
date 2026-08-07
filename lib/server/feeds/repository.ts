import type { D1Database } from "@cloudflare/workers-types";

import { createId, nowInSeconds } from "@/lib/server/auth/crypto";
import { AppError } from "@/lib/server/errors";
import { selectPopularPipelineStories } from "@/lib/server/feeds/popularity";
import type { FeedItem } from "@/lib/server/feeds/rss-parser";
import type {
  FeedInput,
  FeedStatus,
  FeedUpdateInput,
  FeedView,
  PipelineArticlePostUpdate,
  PipelineArticleStatus,
  PipelineArticleView,
  PopularPipelineStory,
  ScrapedArticleInput,
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
  source_text: string | null;
  image_url: string | null;
  merged_into_article_id: string | null;
  published_at: number | null;
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
    sourceText: row.source_text,
    imageUrl: row.image_url,
    mergedIntoArticleId: row.merged_into_article_id,
    publishedAt: row.published_at,
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
    article.source_text,
    article.image_url,
    article.merged_into_article_id,
    article.published_at,
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
              AND article.merged_into_article_id IS NULL
            ORDER BY article.updated_at DESC
            LIMIT 200`,
        )
        .bind(status)
    : database.prepare(
        `${ARTICLE_SELECT}
         WHERE article.merged_into_article_id IS NULL
         ORDER BY article.updated_at DESC
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
         AND article.merged_into_article_id IS NULL
       ORDER BY COALESCE(article.published_at, article.pub_date, article.created_at) DESC
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
         AND article.merged_into_article_id IS NULL
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

export async function getPipelineArticlesByIds(
  database: D1Database,
  articleIds: readonly string[],
) {
  const ids = [...new Set(articleIds)].filter(Boolean);
  if (ids.length === 0) return [];

  const placeholders = ids.map(() => "?").join(", ");
  const result = await database
    .prepare(`${ARTICLE_SELECT} WHERE article.id IN (${placeholders})`)
    .bind(...ids)
    .all<PipelineArticleRow>();
  const articlesById = new Map(result.results.map((row) => [row.id, mapArticle(row)]));
  return ids.flatMap((id) => {
    const article = articlesById.get(id);
    return article ? [article] : [];
  });
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

function scraperFeedUrl(source: string) {
  return `https://scraper.local/${encodeURIComponent(source)}`;
}

function scraperFeedName(source: string) {
  return `Scraper · ${source}`;
}

async function ensureScraperFeed(
  database: D1Database,
  source: string,
  createdByUserId: string,
) {
  const url = scraperFeedUrl(source);
  const existing = await database
    .prepare(`${FEED_SELECT} WHERE url = ? COLLATE NOCASE LIMIT 1`)
    .bind(url)
    .first<FeedRow>();
  if (existing) return mapFeed(existing);

  const id = createId();
  const now = nowInSeconds();
  await database
    .prepare(
      `INSERT INTO feeds (
        id, name, url, status, last_fetched_at, last_fetched_ok, last_error,
        created_at, updated_at, created_by_user_id
      ) VALUES (?, ?, ?, 'paused', NULL, 1, NULL, ?, ?, ?)`,
    )
    .bind(id, scraperFeedName(source), url, now, now, createdByUserId)
    .run();
  const created = await getFeedById(database, id);
  if (!created) {
    throw new AppError(
      "SCRAPER_FEED_CREATE_FAILED",
      "Could not create the scraper source.",
      500,
    );
  }
  return created;
}

function scrapedPublishedAt(value: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1_000) : null;
}

function scrapedDescription(content: string) {
  return content.replace(/\s+/gu, " ").trim().slice(0, 1_000) || null;
}

export async function importScrapedArticles(
  database: D1Database,
  articles: readonly ScrapedArticleInput[],
  importedByUserId: string,
) {
  const feeds = new Map<string, FeedView>();
  let imported = 0;
  let skipped = 0;

  for (const article of articles) {
    let feed = feeds.get(article.source);
    if (!feed) {
      feed = await ensureScraperFeed(database, article.source, importedByUserId);
      feeds.set(article.source, feed);
    }

    const existing = await getPipelineArticleByUrl(database, article.url);
    if (existing) {
      if (!existing.sourceText) {
        await database
          .prepare(
            `UPDATE pipeline_articles
             SET source_text = ?, image_url = COALESCE(image_url, ?), updated_at = ?
             WHERE id = ?`,
          )
          .bind(article.contentText, article.imageUrl, nowInSeconds(), existing.id)
          .run();
      }
      skipped += 1;
      continue;
    }

    const now = nowInSeconds();
    await database
      .prepare(
        `INSERT INTO pipeline_articles (
          id, feed_id, title, url, description, author, pub_date,
          status, rewritten_text, source_text, image_url, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'new', NULL, ?, ?, ?, ?)`,
      )
      .bind(
        createId(),
        feed.id,
        article.title,
        article.url,
        scrapedDescription(article.contentText),
        article.author,
        scrapedPublishedAt(article.publishedAt),
        article.contentText,
        article.imageUrl,
        now,
        now,
      )
      .run();
    imported += 1;
  }

  return { imported, skipped, sources: feeds.size };
}

export async function listPopularPipelineStories(
  database: D1Database,
  limit = 5,
): Promise<PopularPipelineStory[]> {
  // The one-click batch is intentionally limited to reports with the text
  // captured by the scraper. RSS-only entries often contain only a teaser and
  // can point to pages that are too large or blocked for a second fetch.
  const result = await database
    .prepare(
      `${ARTICLE_SELECT}
       WHERE article.status = 'new'
         AND article.merged_into_article_id IS NULL
         AND article.source_text IS NOT NULL
         AND length(trim(article.source_text)) > 0
       ORDER BY article.created_at DESC
       LIMIT 200`,
    )
    .all<PipelineArticleRow>();
  return selectPopularPipelineStories(result.results.map(mapArticle), limit);
}

export async function markPipelineArticlesMerged(
  database: D1Database,
  canonicalArticleId: string,
  relatedArticleIds: readonly string[],
) {
  const ids = [...new Set(relatedArticleIds)].filter((id) => id && id !== canonicalArticleId);
  if (ids.length === 0) return 0;

  const now = nowInSeconds();
  const results = await database.batch(
    ids.map((id) =>
      database
        .prepare(
          `UPDATE pipeline_articles
           SET merged_into_article_id = ?, updated_at = ?
           WHERE id = ?
             AND id != ?
             AND status = 'new'
             AND merged_into_article_id IS NULL`,
        )
        .bind(canonicalArticleId, now, id, canonicalArticleId),
    ),
  );
  return results.reduce((count, result) => count + result.meta.changes, 0);
}

export async function updatePipelineArticleStatus(
  database: D1Database,
  articleId: string,
  status: PipelineArticleStatus,
) {
  const now = nowInSeconds();
  const result = await database
    .prepare(
      `UPDATE pipeline_articles
       SET status = ?,
           published_at = CASE
             WHEN ? = 'approved' AND status != 'approved' THEN ?
             ELSE published_at
           END,
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(status, status, now, now, articleId)
    .run();
  return result.meta.changes > 0;
}

export async function updatePipelineArticlePost(
  database: D1Database,
  articleId: string,
  input: PipelineArticlePostUpdate,
) {
  const assignments: string[] = [];
  const values: Array<string | number | null> = [];
  const now = nowInSeconds();

  if (input.rewrittenText !== undefined) {
    assignments.push("rewritten_text = ?");
    values.push(input.rewrittenText);
    if (input.status === undefined) {
      assignments.push(
        "status = CASE WHEN status = 'approved' THEN 'approved' ELSE 'rewritten' END",
      );
    }
  }
  if (input.imageUrl !== undefined) {
    assignments.push("image_url = ?");
    values.push(input.imageUrl);
  }
  if (input.status !== undefined) {
    assignments.push("status = ?");
    values.push(input.status);
    assignments.push(
      "published_at = CASE WHEN ? = 'approved' AND status != 'approved' THEN ? ELSE published_at END",
    );
    values.push(input.status, now);
  }

  assignments.push("updated_at = ?");
  values.push(now, articleId);
  const result = await database
    .prepare(
      `UPDATE pipeline_articles
       SET ${assignments.join(", ")}
       WHERE id = ? AND merged_into_article_id IS NULL`,
    )
    .bind(...values)
    .run();
  return result.meta.changes > 0;
}

export async function setPipelineArticleRewritten(
  database: D1Database,
  articleId: string,
  rewrittenText: string,
  status: "rewritten" | "approved" = "rewritten",
) {
  const now = nowInSeconds();
  const result = await database
    .prepare(
      `UPDATE pipeline_articles
       SET status = ?,
           rewritten_text = ?,
           published_at = CASE
             WHEN ? = 'approved' AND status != 'approved' THEN ?
             ELSE published_at
           END,
           updated_at = ?
       WHERE id = ? AND merged_into_article_id IS NULL`,
    )
    .bind(status, rewrittenText, status, now, now, articleId)
    .run();
  return result.meta.changes > 0;
}
