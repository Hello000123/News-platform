import type { PipelineArticleView, PopularPipelineStory } from "@/lib/shared/feeds-contracts";

type PopularityArticle = Pick<
  PipelineArticleView,
  "id" | "feedId" | "title" | "pubDate" | "createdAt" | "sourceText" | "description"
>;

interface StoryCluster {
  articles: PopularityArticle[];
}

const commonTitleWords = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "after",
  "before",
  "news",
  "report",
  "reports",
  "says",
  "said",
  "update",
  "updates",
]);

function normalizedTitle(title: string) {
  return title
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[\p{P}\p{S}\s]+/gu, "")
    .trim();
}

function latinAndNumberTokens(title: string) {
  return new Set(
    (title.normalize("NFKC").toLocaleLowerCase("en").match(/[\p{Script=Latin}\p{N}]+/gu) ?? [])
      .filter((token) => token.length > 1 && !commonTitleWords.has(token)),
  );
}

function hanBigrams(title: string) {
  const runs = title.normalize("NFKC").match(/\p{Script=Han}+/gu) ?? [];
  const grams = new Set<string>();
  for (const run of runs) {
    const characters = Array.from(run);
    if (characters.length === 1) {
      grams.add(characters[0]);
      continue;
    }
    for (let index = 0; index < characters.length - 1; index += 1) {
      grams.add(characters.slice(index, index + 2).join(""));
    }
  }
  return grams;
}

function intersectionSize(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  const [smaller, larger] = left.size <= right.size ? [left, right] : [right, left];
  let count = 0;
  for (const value of smaller) {
    if (larger.has(value)) count += 1;
  }
  return count;
}

function jaccard(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  if (left.size === 0 || right.size === 0) return 0;
  const shared = intersectionSize(left, right);
  return shared / (left.size + right.size - shared);
}

/**
 * Conservative title-only relationship detection. Exact titles are always
 * grouped; otherwise stories need multiple specific Latin/number tokens or a
 * strong overlap of Chinese title bigrams. It deliberately avoids body-text
 * matching, which tends to join unrelated recurring topics.
 */
export function titlesDescribeSameStory(leftTitle: string, rightTitle: string) {
  const leftNormalized = normalizedTitle(leftTitle);
  const rightNormalized = normalizedTitle(rightTitle);
  if (!leftNormalized || !rightNormalized) return false;
  if (leftNormalized === rightNormalized) return true;

  const leftLatin = latinAndNumberTokens(leftTitle);
  const rightLatin = latinAndNumberTokens(rightTitle);
  const latinShared = intersectionSize(leftLatin, rightLatin);
  if (
    latinShared >= 2 &&
    (jaccard(leftLatin, rightLatin) >= 0.34 || Math.min(leftLatin.size, rightLatin.size) <= 3)
  ) {
    return true;
  }

  const leftHan = hanBigrams(leftTitle);
  const rightHan = hanBigrams(rightTitle);
  return intersectionSize(leftHan, rightHan) >= 3 && jaccard(leftHan, rightHan) >= 0.46;
}

function sourceTextLength(article: PopularityArticle) {
  return article.sourceText?.trim().length ?? article.description?.trim().length ?? 0;
}

function articleTimestamp(article: PopularityArticle) {
  return article.pubDate ?? article.createdAt;
}

function canonicalArticle(articles: readonly PopularityArticle[]) {
  return [...articles].sort(
    (left, right) =>
      sourceTextLength(right) - sourceTextLength(left) ||
      articleTimestamp(right) - articleTimestamp(left) ||
      left.id.localeCompare(right.id),
  )[0]!;
}

function newestTimestamp(articles: readonly PopularityArticle[]) {
  return Math.max(...articles.map(articleTimestamp));
}

/**
 * Groups fresh reports into story clusters and ranks clusters by independent
 * feed coverage, then total report count, then recency. A cluster is returned
 * once, so a top-five batch never asks the editor to rewrite its duplicates.
 */
export function selectPopularPipelineStories(
  articles: readonly PopularityArticle[],
  limit = 5,
): PopularPipelineStory[] {
  const parent = articles.map((_article, index) => index);
  const find = (index: number): number => {
    if (parent[index] === index) return index;
    parent[index] = find(parent[index]);
    return parent[index];
  };
  const unite = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };

  // Relationship matching is transitive. Compare every pair before forming
  // clusters so A↔B and A↔C form one story even when B↔C alone is weaker.
  for (let left = 0; left < articles.length; left += 1) {
    for (let right = left + 1; right < articles.length; right += 1) {
      if (titlesDescribeSameStory(articles[left].title, articles[right].title)) {
        unite(left, right);
      }
    }
  }

  const clustersByRoot = new Map<number, PopularityArticle[]>();
  for (const [index, article] of articles.entries()) {
    const root = find(index);
    const cluster = clustersByRoot.get(root) ?? [];
    cluster.push(article);
    clustersByRoot.set(root, cluster);
  }
  const clusters: StoryCluster[] = [...clustersByRoot.values()].map((cluster) => ({
    articles: cluster,
  }));

  return clusters
    .map((cluster) => {
      const canonical = canonicalArticle(cluster.articles);
      return {
        articleId: canonical.id,
        title: canonical.title,
        sourceCount: new Set(cluster.articles.map((article) => article.feedId)).size,
        reportCount: cluster.articles.length,
        publishedAt: newestTimestamp(cluster.articles) || null,
        relatedArticleIds: [
          canonical.id,
          ...cluster.articles
            .filter((article) => article.id !== canonical.id)
            .sort(
              (left, right) =>
                articleTimestamp(right) - articleTimestamp(left) || left.id.localeCompare(right.id),
            )
            .map((article) => article.id),
        ],
      };
    })
    .sort(
      (left, right) =>
        right.sourceCount - left.sourceCount ||
        right.reportCount - left.reportCount ||
        (right.publishedAt ?? 0) - (left.publishedAt ?? 0) ||
        left.title.localeCompare(right.title),
    )
    .slice(0, Math.max(0, Math.min(Math.floor(limit), 5)));
}
