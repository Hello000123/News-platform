import type { D1Database } from "@cloudflare/workers-types";

import { nowInSeconds } from "@/lib/server/auth/crypto";
import { AppError } from "@/lib/server/errors";
import {
  articlePresentationFingerprint,
  articlePresentationSchema,
  createDefaultArticlePresentation,
  validateArticlePresentation,
  type ArticlePresentation,
} from "@/lib/shared/article-presentation";
import type { PublicPagePresentationSource } from "@/lib/shared/public-page-presentation";

interface PublicPagePresentationRow {
  draft_json: string;
  draft_updated_at: number;
  published_json: string | null;
  published_at: number | null;
}

export interface PublicPagePresentationState {
  draft: ArticlePresentation;
  published: ArticlePresentation;
  draftUpdatedAt: number | null;
  publishedAt: number | null;
  hasUnpublishedChanges: boolean;
}

function invalidPresentation(message: string, status = 400) {
  return new AppError("INVALID_PUBLIC_PAGE_PRESENTATION", message, status);
}

function defaultPresentation(source: PublicPagePresentationSource) {
  return createDefaultArticlePresentation(
    source.sourceUpdatedAt,
    source.sourceBlocks,
    source.sourceImageIds,
  );
}

function readStoredPresentation(
  json: string | null,
  source: PublicPagePresentationSource,
) {
  if (!json) return null;
  try {
    const parsed = articlePresentationSchema.parse(JSON.parse(json));
    const fallback = defaultPresentation(source);
    const storedBlocks = new Map(parsed.blocks.map((block) => [block.id, block]));
    const storedImageValue = <T>(values: Record<string, T>, imageId: string) => {
      for (const candidateId of [
        imageId,
        ...(source.legacyImageIdsBySourceId[imageId] ?? []),
      ]) {
        if (values[candidateId] !== undefined) return values[candidateId];
      }
      return undefined;
    };
    const imageSettings = Object.fromEntries(
      source.sourceImageIds.map((imageId) => [
        imageId,
        storedImageValue(parsed.imageSettings, imageId) ??
          fallback.imageSettings[imageId],
      ]),
    );
    const imageSources = Object.fromEntries(
      source.sourceImageIds
        .map((imageId) => [
          imageId,
          storedImageValue(parsed.imageSources, imageId),
        ])
        .filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
    return validateArticlePresentation(
      {
        ...fallback,
        blocks: fallback.blocks.map(
          (block) => storedBlocks.get(block.id) ?? block,
        ),
        imageSettings,
        imageSources,
      },
      source.sourceUpdatedAt,
      source.sourceBlocks,
      source.sourceImageIds,
    );
  } catch {
    return null;
  }
}

function sanitizePresentation(
  presentation: unknown,
  source: PublicPagePresentationSource,
) {
  try {
    return validateArticlePresentation(
      presentation,
      source.sourceUpdatedAt,
      source.sourceBlocks,
      source.sourceImageIds,
    );
  } catch (error) {
    throw invalidPresentation(
      error instanceof Error
        ? error.message
        : "The public-page presentation is invalid.",
    );
  }
}

export async function getPublicPagePresentationState(
  database: D1Database,
  source: PublicPagePresentationSource,
): Promise<PublicPagePresentationState> {
  const row = await database
    .prepare(
      `SELECT draft_json, draft_updated_at, published_json, published_at
       FROM public_page_presentations
       WHERE page_key = ?
       LIMIT 1`,
    )
    .bind(source.pageKey)
    .first<PublicPagePresentationRow>();
  const fallback = defaultPresentation(source);
  const draft = readStoredPresentation(row?.draft_json ?? null, source) ?? fallback;
  const published =
    readStoredPresentation(row?.published_json ?? null, source) ?? fallback;
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

export async function savePublicPagePresentationDraft(
  database: D1Database,
  source: PublicPagePresentationSource,
  presentation: unknown,
  actorUserId: string,
) {
  const sanitized = sanitizePresentation(presentation, source);
  const now = nowInSeconds();
  await database
    .prepare(
      `INSERT INTO public_page_presentations (
         page_key, draft_json, draft_source_updated_at,
         draft_updated_by_user_id, draft_updated_at
       ) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(page_key) DO UPDATE SET
         draft_json = excluded.draft_json,
         draft_source_updated_at = excluded.draft_source_updated_at,
         draft_updated_by_user_id = excluded.draft_updated_by_user_id,
         draft_updated_at = excluded.draft_updated_at`,
    )
    .bind(
      source.pageKey,
      JSON.stringify(sanitized),
      source.sourceUpdatedAt,
      actorUserId,
      now,
    )
    .run();
  return { presentation: sanitized, savedAt: now };
}

export async function publishPublicPagePresentation(
  database: D1Database,
  source: PublicPagePresentationSource,
  presentation: unknown,
  actorUserId: string,
) {
  const sanitized = sanitizePresentation(presentation, source);
  const serialized = JSON.stringify(sanitized);
  const now = nowInSeconds();
  await database
    .prepare(
      `INSERT INTO public_page_presentations (
         page_key, draft_json, draft_source_updated_at,
         draft_updated_by_user_id, draft_updated_at,
         published_json, published_source_updated_at,
         published_by_user_id, published_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(page_key) DO UPDATE SET
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
      source.pageKey,
      serialized,
      source.sourceUpdatedAt,
      actorUserId,
      now,
      serialized,
      source.sourceUpdatedAt,
      actorUserId,
      now,
    )
    .run();
  return { presentation: sanitized, publishedAt: now };
}
