import type { ArticlePresentationSourceBlock } from "@/lib/shared/article-presentation";

export const PUBLIC_PAGE_PRESENTATION_KEYS = [
  "homepage",
  "technology",
  "social-enterprise",
] as const;

export type PublicPagePresentationKey =
  (typeof PUBLIC_PAGE_PRESENTATION_KEYS)[number];

export interface PublicPagePresentationSource {
  pageKey: PublicPagePresentationKey;
  sourceUpdatedAt: number;
  sourceBlocks: ArticlePresentationSourceBlock[];
  sourceImageIds: string[];
}

function stableHash(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function presentationItemToken(value: string) {
  return stableHash(value).toString(36);
}

export function createPublicPagePresentationSource(
  pageKey: PublicPagePresentationKey,
  sourceBlocks: readonly ArticlePresentationSourceBlock[],
  sourceImageIds: readonly string[],
): PublicPagePresentationSource {
  const revisionInput = JSON.stringify({
    pageKey,
    blocks: sourceBlocks.map(({ id, text }) => [id, text]),
    images: sourceImageIds,
  });
  return {
    pageKey,
    sourceUpdatedAt: stableHash(revisionInput),
    sourceBlocks: sourceBlocks.map((block) => ({ ...block })),
    sourceImageIds: [...sourceImageIds],
  };
}
