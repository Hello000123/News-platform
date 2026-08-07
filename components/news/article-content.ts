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

export function articleDisplayTitle(article: PipelineArticleView) {
  const rewrittenParagraphs = articleParagraphs(article.rewrittenText ?? "");
  return rewrittenParagraphs.length >= 2
    ? rewrittenParagraphs[0]
    : article.title;
}

/** Treats the first paragraph of a complete rewrite as its editorial headline. */
export function articleBodyParagraphs(article: PipelineArticleView) {
  const paragraphs = articleParagraphs(article.rewrittenText ?? "");
  if (paragraphs.length >= 2) return paragraphs.slice(1);
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
  return article.publishedAt ?? article.pubDate ?? article.createdAt;
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
  const sameCategory = currentArticle.category
    ? unique.filter((article) => article.category === currentArticle.category)
    : [];
  const sameCategoryIds = new Set(sameCategory.map(({ id }) => id));
  const sameFeed = unique.filter(
    (article) =>
      !sameCategoryIds.has(article.id) && article.feedId === currentArticle.feedId,
  );
  const rankedIds = new Set([...sameCategory, ...sameFeed].map(({ id }) => id));
  const otherArticles = unique.filter((article) => !rankedIds.has(article.id));
  return [...sameCategory, ...sameFeed, ...otherArticles].slice(0, safeLimit);
}
