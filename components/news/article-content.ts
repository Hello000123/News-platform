import type { PipelineArticleView } from "@/lib/shared/feeds-contracts";

const SUMMARY_MAX_LENGTH = 240;
const KEY_POINT_MAX_LENGTH = 88;

export function normalizeArticleText(value: string) {
  return value.replace(/\s+/gu, " ").trim();
}

export function truncateArticleText(value: string, maximum: number) {
  const normalized = normalizeArticleText(value);
  if (normalized.length <= maximum) return normalized;
  return `${normalized.slice(0, maximum - 1).trim()}…`;
}

export function articleParagraphs(text: string) {
  return text
    .split(/\n\s*\n/u)
    .map(normalizeArticleText)
    .filter(Boolean);
}

/**
 * Keeps every meaningful paragraph, except a title repeated verbatim as the
 * opening paragraph. RSS rewrite output is not otherwise treated as metadata.
 */
export function articleBodyParagraphs(article: PipelineArticleView) {
  const paragraphs = articleParagraphs(article.rewrittenText ?? "");
  if (
    paragraphs[0] &&
    normalizeArticleText(paragraphs[0]) === normalizeArticleText(article.title)
  ) {
    return paragraphs.slice(1);
  }
  return paragraphs;
}

export function extractArticleSummary(article: PipelineArticleView) {
  const description = article.description?.trim();
  if (description) return truncateArticleText(description, SUMMARY_MAX_LENGTH);

  const firstBodyParagraph = articleBodyParagraphs(article)[0];
  return firstBodyParagraph
    ? truncateArticleText(firstBodyParagraph, SUMMARY_MAX_LENGTH)
    : null;
}

export function extractArticleKeyPoints(article: PipelineArticleView) {
  return articleBodyParagraphs(article)
    .slice(0, 3)
    .map((paragraph) => truncateArticleText(paragraph, KEY_POINT_MAX_LENGTH))
    .filter(Boolean);
}

export function articleTimestamp(article: PipelineArticleView) {
  return article.pubDate ?? article.createdAt;
}

export function placeholderImageUrl(
  articleId: string,
  width: number,
  height: number,
) {
  const seed = encodeURIComponent(`pressready-${articleId}`);
  return `https://picsum.photos/seed/${seed}/${width}/${height}.webp?grayscale`;
}

export function selectRelatedArticles(
  currentArticle: PipelineArticleView,
  candidates: readonly PipelineArticleView[],
  limit = 3,
) {
  const safeLimit = Math.max(0, Math.floor(limit));
  const seen = new Set<string>([currentArticle.id]);
  const unique = candidates.filter((article) => {
    if (seen.has(article.id)) return false;
    seen.add(article.id);
    return true;
  });
  const sameFeed = unique.filter((article) => article.feedId === currentArticle.feedId);
  const otherFeeds = unique.filter((article) => article.feedId !== currentArticle.feedId);
  return [...sameFeed, ...otherFeeds].slice(0, safeLimit);
}
