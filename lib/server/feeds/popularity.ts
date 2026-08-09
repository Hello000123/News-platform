import {
  MAX_PIPELINE_RELATED_ARTICLE_IDS,
  type PipelineArticleView,
  type PopularPipelineStory,
} from "@/lib/shared/feeds-contracts";

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

const recurringGuidePublisherWords = new Set(["new", "nyt", "nytimes", "times", "york"]);

const latinEventTokenGroups: Readonly<Record<string, string>> = {
  debut: "event:launch",
  debuts: "event:launch",
  launch: "event:launch",
  launched: "event:launch",
  launches: "event:launch",
  launching: "event:launch",
  release: "event:launch",
  released: "event:launch",
  releases: "event:launch",
  unveil: "event:launch",
  unveiled: "event:launch",
  unveils: "event:launch",
  recall: "event:recall",
  recalled: "event:recall",
  recalls: "event:recall",
  withdraw: "event:recall",
  withdrew: "event:recall",
  withdrawn: "event:recall",
  rise: "event:rise",
  rises: "event:rise",
  rose: "event:rise",
  rising: "event:rise",
  increase: "event:rise",
  increased: "event:rise",
  increases: "event:rise",
  higher: "event:rise",
  fall: "event:fall",
  falls: "event:fall",
  fell: "event:fall",
  falling: "event:fall",
  decrease: "event:fall",
  decreased: "event:fall",
  decreases: "event:fall",
  lower: "event:fall",
  approve: "event:approve",
  approved: "event:approve",
  approves: "event:approve",
  reject: "event:reject",
  rejected: "event:reject",
  rejects: "event:reject",
  outage: "event:outage",
  outages: "event:outage",
  pricing: "event:pricing",
  price: "event:pricing",
  prices: "event:pricing",
};

const hanEventPatterns: ReadonlyArray<readonly [string, RegExp]> = [
  ["event:launch", /(?:推出|發布|發表|揭曉|面世)/u],
  ["event:recall", /(?:召回|停售|撤回|下架)/u],
  ["event:rise", /(?:連升|上升|上漲|增加|增長|回升)/u],
  ["event:fall", /(?:連跌|下跌|下滑|下降|減少|回落)/u],
  ["event:approve", /(?:批准|通過|獲批)/u],
  ["event:reject", /(?:拒絕|否決|不獲批)/u],
];

function normalizeLatinTitleToken(token: string) {
  return latinEventTokenGroups[token] ?? token;
}

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
      .filter((token) => token.length > 1 && !commonTitleWords.has(token))
      .map(normalizeLatinTitleToken),
  );
}

function titleEventSignature(title: string) {
  const signature = new Set(
    [...latinAndNumberTokens(title)].filter((token) => token.startsWith("event:")),
  );
  for (const [event, pattern] of hanEventPatterns) {
    if (pattern.test(title)) signature.add(event);
  }
  return signature;
}

function eventSignaturesConflict(leftTitle: string, rightTitle: string) {
  const left = titleEventSignature(leftTitle);
  const right = titleEventSignature(rightTitle);
  const mutuallyExclusiveEvents = [
    ["event:launch", "event:recall"],
    ["event:rise", "event:fall"],
    ["event:approve", "event:reject"],
  ] as const;
  if (
    mutuallyExclusiveEvents.some(
      ([first, second]) =>
        (left.has(first) && right.has(second)) ||
        (left.has(second) && right.has(first)),
    )
  ) {
    return true;
  }
  return left.size > 0 && right.size > 0 && intersectionSize(left, right) === 0;
}

function recurringGuideSubject(title: string) {
  const normalized = title.normalize("NFKC").toLocaleLowerCase("en");
  const match = normalized.match(
    /^(.*?)\b(?:hints?|clues?)\s+(?:and|&)\s+(?:answers?|solutions?)\b/iu,
  );
  if (!match) return null;

  const subjectTokens =
    match[1].match(/[\p{Script=Latin}\p{N}]+/gu)?.filter(
      (token) => !commonTitleWords.has(token) && !recurringGuidePublisherWords.has(token),
    ) ?? [];
  return subjectTokens.length > 0 ? subjectTokens.join(" ") : null;
}

function recurringGuideSubjectsConflict(leftTitle: string, rightTitle: string) {
  const leftSubject = recurringGuideSubject(leftTitle);
  const rightSubject = recurringGuideSubject(rightTitle);
  return Boolean(leftSubject && rightSubject && leftSubject !== rightSubject);
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
  if (recurringGuideSubjectsConflict(leftTitle, rightTitle)) return false;
  if (eventSignaturesConflict(leftTitle, rightTitle)) return false;

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

/** Returns only reports connected to the canonical story, including transitive matches. */
export function connectedStoryArticles<T extends { id: string; title: string }>(
  canonicalArticle: T,
  relatedArticles: readonly T[],
) {
  const allArticles = [canonicalArticle, ...relatedArticles];
  const connectedIds = new Set([canonicalArticle.id]);
  const queue = [canonicalArticle];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    for (const candidate of allArticles) {
      if (
        connectedIds.has(candidate.id) ||
        !titlesDescribeSameStory(current.title, candidate.title)
      ) {
        continue;
      }
      connectedIds.add(candidate.id);
      queue.push(candidate);
    }
  }
  return relatedArticles.filter((candidate) => connectedIds.has(candidate.id));
}

function sourceTextLength(article: PopularityArticle) {
  return article.sourceText?.trim().length ?? article.description?.trim().length ?? 0;
}

function hasSavedSourceText(article: PopularityArticle) {
  return Boolean(article.sourceText?.trim());
}

function articleTimestamp(article: PopularityArticle) {
  return article.pubDate ?? article.createdAt;
}

function canonicalArticle(articles: readonly PopularityArticle[]) {
  return [...articles].sort(
    (left, right) =>
      Number(hasSavedSourceText(right)) - Number(hasSavedSourceText(left)) ||
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
export function rankPopularPipelineStories(
  articles: readonly PopularityArticle[],
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
        ].slice(0, MAX_PIPELINE_RELATED_ARTICLE_IDS),
      };
    })
    .sort(
      (left, right) =>
        right.sourceCount - left.sourceCount ||
        right.reportCount - left.reportCount ||
        (right.publishedAt ?? 0) - (left.publishedAt ?? 0) ||
        left.title.localeCompare(right.title),
    );
}

export function selectPopularPipelineStories(
  articles: readonly PopularityArticle[],
  limit = 5,
): PopularPipelineStory[] {
  return rankPopularPipelineStories(articles).slice(
    0,
    Math.max(0, Math.min(Math.floor(limit), 5)),
  );
}
