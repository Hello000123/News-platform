import type { D1Database } from "@cloudflare/workers-types";

import { articlePresentationSourceBlocks } from "@/components/news/article-content";
import { nowInSeconds } from "@/lib/server/auth/crypto";
import { AppError } from "@/lib/server/errors";
import {
  articlePresentationFingerprint,
  articlePresentationSchema,
  createDefaultArticlePresentation,
  validateArticlePresentation,
  type ArticlePresentation,
} from "@/lib/shared/article-presentation";
import type { PipelineArticleView } from "@/lib/shared/feeds-contracts";

interface ArticlePresentationRow {
  draft_json: string;
  draft_source_updated_at: number;
  draft_updated_at: number;
  published_json: string | null;
  published_source_updated_at: number | null;
  published_at: number | null;
}

export interface ArticlePresentationState {
  draft: ArticlePresentation;
  published: ArticlePresentation;
  draftUpdatedAt: number | null;
  publishedAt: number | null;
  hasUnpublishedChanges: boolean;
}

function invalidPresentation(message: string, status = 400) {
  return new AppError("INVALID_ARTICLE_PRESENTATION", message, status);
}

function validatedPresentationForArticle(
  raw: unknown,
  article: PipelineArticleView,
) {
  const parsed = articlePresentationSchema.parse(raw);
  const validated = validateArticlePresentation(
    parsed,
    parsed.sourceUpdatedAt,
    articlePresentationSourceBlocks(article),
  );
  return articlePresentationSchema.parse({
    ...validated,
    sourceUpdatedAt: article.updatedAt,
  });
}

function readStoredPresentation(
  json: string | null,
  article: PipelineArticleView,
) {
  if (!json) return null;
  try {
    return validatedPresentationForArticle(JSON.parse(json), article);
  } catch {
    // A content edit invalidates range-based formatting. Falling back to the
    // immutable default is safer than applying spans to different text.
    return null;
  }
}

function defaultPresentation(article: PipelineArticleView) {
  return createDefaultArticlePresentation(
    article.updatedAt,
    articlePresentationSourceBlocks(article),
  );
}

export async function getArticlePresentationState(
  database: D1Database,
  article: PipelineArticleView,
): Promise<ArticlePresentationState> {
  const row = await database
    .prepare(
      `SELECT
         draft_json, draft_source_updated_at, draft_updated_at,
         published_json, published_source_updated_at, published_at
       FROM article_presentations
       WHERE article_id = ?
       LIMIT 1`,
    )
    .bind(article.id)
    .first<ArticlePresentationRow>();
  const fallback = defaultPresentation(article);
  const draft = readStoredPresentation(row?.draft_json ?? null, article) ?? fallback;
  const published =
    readStoredPresentation(row?.published_json ?? null, article) ?? fallback;
  return {
    draft,
    published,
    draftUpdatedAt: row?.draft_updated_at ?? null,
    publishedAt: row?.published_at ?? null,
    hasUnpublishedChanges:
      articlePresentationFingerprint(draft) !==
      articlePresentationFingerprint(published),
  };
}

export async function getPublishedArticlePresentation(
  database: D1Database,
  article: PipelineArticleView,
) {
  return (await getArticlePresentationState(database, article)).published;
}

function sanitizePresentation(
  presentation: unknown,
  article: PipelineArticleView,
) {
  try {
    return validateArticlePresentation(
      presentation,
      article.updatedAt,
      articlePresentationSourceBlocks(article),
    );
  } catch (error) {
    throw invalidPresentation(
      error instanceof Error
        ? error.message
        : "The article presentation is invalid.",
    );
  }
}

export async function saveArticlePresentationDraft(
  database: D1Database,
  article: PipelineArticleView,
  presentation: unknown,
  actorUserId: string,
) {
  const sanitized = sanitizePresentation(presentation, article);
  const now = nowInSeconds();
  const result = await database
    .prepare(
      `INSERT INTO article_presentations (
         article_id, draft_json, draft_source_updated_at,
         draft_updated_by_user_id, draft_updated_at
       )
       SELECT ?, ?, ?, ?, ?
       FROM pipeline_articles
       WHERE id = ? AND updated_at = ? AND merged_into_article_id IS NULL
       ON CONFLICT(article_id) DO UPDATE SET
         draft_json = excluded.draft_json,
         draft_source_updated_at = excluded.draft_source_updated_at,
         draft_updated_by_user_id = excluded.draft_updated_by_user_id,
         draft_updated_at = excluded.draft_updated_at`,
    )
    .bind(
      article.id,
      JSON.stringify(sanitized),
      article.updatedAt,
      actorUserId,
      now,
      article.id,
      article.updatedAt,
    )
    .run();
  if (result.meta.changes !== 1) {
    throw invalidPresentation(
      "The article changed while the presentation was being saved. Refresh and try again.",
      409,
    );
  }
  return { presentation: sanitized, savedAt: now };
}

export async function publishArticlePresentation(
  database: D1Database,
  article: PipelineArticleView,
  presentation: unknown,
  actorUserId: string,
) {
  const sanitized = sanitizePresentation(presentation, article);
  const serialized = JSON.stringify(sanitized);
  const now = nowInSeconds();
  const results = await database.batch([
    database
      .prepare(
        `INSERT INTO article_presentations (
           article_id, draft_json, draft_source_updated_at,
           draft_updated_by_user_id, draft_updated_at,
           published_json, published_source_updated_at,
           published_by_user_id, published_at
         )
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
         FROM pipeline_articles
         WHERE id = ? AND updated_at = ? AND merged_into_article_id IS NULL
         ON CONFLICT(article_id) DO UPDATE SET
           draft_json = excluded.draft_json,
           draft_source_updated_at = excluded.draft_source_updated_at,
           draft_updated_by_user_id = excluded.draft_updated_by_user_id,
           draft_updated_at = excluded.draft_updated_at,
           published_json = excluded.published_json,
           published_source_updated_at = excluded.published_source_updated_at,
           published_by_user_id = excluded.published_by_user_id,
           published_at = excluded.published_at`,
      )
      .bind(
        article.id,
        serialized,
        article.updatedAt,
        actorUserId,
        now,
        serialized,
        article.updatedAt,
        actorUserId,
        now,
        article.id,
        article.updatedAt,
      ),
    database
      .prepare(
        `UPDATE pipeline_articles
         SET status = 'approved',
             published_at = CASE
               WHEN status != 'approved' OR published_at IS NULL THEN ?
               ELSE published_at
             END,
             updated_at = ?
         WHERE id = ? AND updated_at = ? AND merged_into_article_id IS NULL`,
      )
      .bind(now, now, article.id, article.updatedAt),
  ]);
  if (
    (results[0]?.meta.changes ?? 0) !== 1 ||
    (results[1]?.meta.changes ?? 0) !== 1
  ) {
    throw invalidPresentation(
      "The article changed while the presentation was being published. Refresh and try again.",
      409,
    );
  }
  return {
    presentation: articlePresentationSchema.parse({
      ...sanitized,
      sourceUpdatedAt: now,
    }),
    publishedAt: now,
  };
}
