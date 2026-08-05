import Link from "next/link";
import type { ReactNode } from "react";

import {
  articleTimestamp,
  extractArticleKeyPoints,
  extractArticleSummary,
  placeholderImageUrl,
} from "@/components/news/article-content";
import { EditorialPublicFooter, EditorialPublicHeader } from "@/components/news/editorial-public-chrome";
import type { PipelineArticleView } from "@/lib/shared/feeds-contracts";

const MAX_HOMEPAGE_ARTICLES = 15;
const PROTOTYPE_TOPICS = ["生成式 AI", "數碼共融", "社區創新", "影響力營運"];

export { extractArticleKeyPoints, extractArticleSummary, placeholderImageUrl };

export interface HomepageArticle {
  article: PipelineArticleView;
  summary: string | null;
  keyPoints: string[];
  isPrototype?: boolean;
  imageUrl?: string;
}

export interface HomepageView {
  lead: HomepageArticle | null;
  related: HomepageArticle[];
  featureColumns: HomepageArticle[][];
  latest: HomepageArticle[];
  topics: string[];
}

interface PrototypeArticleDefinition {
  id: string;
  feedName: string;
  title: string;
  summary?: string;
  author?: string;
  publishedAt: string;
  keyPoints?: string[];
  imageUrl?: string;
}

function prototypeArticle({
  id,
  feedName,
  title,
  summary,
  author,
  publishedAt,
  keyPoints = [],
  imageUrl,
}: PrototypeArticleDefinition): HomepageArticle {
  const timestamp = Math.floor(Date.parse(publishedAt) / 1_000);

  return {
    article: {
      id,
      feedId: "pressready-prototype",
      feedName,
      title,
      url: `https://example.com/${id}`,
      description: summary ?? null,
      author: author ?? null,
      pubDate: timestamp,
      status: "approved",
      rewrittenText: [title, ...keyPoints].join("\n\n"),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    summary: summary ?? null,
    keyPoints,
    isPrototype: true,
    imageUrl,
  };
}

const PROTOTYPE_HOMEPAGE_ARTICLES: readonly HomepageArticle[] = [
  prototypeArticle({
    id: "prototype-community-tech",
    feedName: "科技 × 社企編輯室",
    title: "當公共 AI 走進社區，誰來定義真正需要解決的問題？",
    summary: "從長者數碼支援到社企營運分析，真正的考驗不只是模型能力，而是科技能否回應每一種日常需要。",
    author: "科技 × 社企編輯室",
    publishedAt: "2026-07-28T08:30:00+08:00",
    keyPoints: [
      "先由服務現場定義問題，再選擇合適的科技。",
      "把數碼能力、語言及使用限制納入設計。",
      "以長期社會效益檢視工具的真正價值。",
    ],
    imageUrl: "https://picsum.photos/seed/community-tech/1200/800.webp?grayscale",
  }),
  prototypeArticle({
    id: "prototype-accessible-ai",
    feedName: "科技",
    title: "產品團隊如何讓 AI 介面回應不同使用能力",
    publishedAt: "2026-07-28T08:10:00+08:00",
    imageUrl: "https://picsum.photos/seed/accessible-ai/720/405.webp?grayscale",
  }),
  prototypeArticle({
    id: "prototype-repair-network",
    feedName: "社企專欄",
    title: "維修社企如何把技能、零件與社區需要連起來",
    publishedAt: "2026-07-28T07:55:00+08:00",
    imageUrl: "https://picsum.photos/seed/repair-network/720/405.webp?grayscale",
  }),
  prototypeArticle({
    id: "prototype-open-source-tech",
    feedName: "科技",
    title: "開源團隊重新設計繁體中文模型的評測方法",
    summary: "新框架不只比較答案正確率，也把粵語語境、資料透明度與實際使用情境納入測試。",
    author: "何日安",
    publishedAt: "2026-07-28T07:40:00+08:00",
    imageUrl: "https://picsum.photos/seed/open-source-tech/960/540.webp?grayscale",
  }),
  prototypeArticle({
    id: "prototype-ai-product-team",
    feedName: "產品與數據",
    title: "小型團隊開始評估 AI 工具真正節省的工時",
    publishedAt: "2026-07-28T07:20:00+08:00",
  }),
  prototypeArticle({
    id: "prototype-inclusive-design",
    feedName: "數碼共融",
    title: "無障礙設計正在成為產品開發的基本功",
    publishedAt: "2026-07-28T07:00:00+08:00",
  }),
  prototypeArticle({
    id: "prototype-shared-kitchen",
    feedName: "社企專欄",
    title: "共享廚房如何在使命、成本與成長之間建立平衡",
    summary: "團隊把共同採購、人才培訓與會員制度放進同一營運模型，尋找能夠長期延續的收入。",
    author: "梁文希",
    publishedAt: "2026-07-28T06:40:00+08:00",
    imageUrl: "https://picsum.photos/seed/social-enterprise/960/540.webp?grayscale",
  }),
  prototypeArticle({
    id: "prototype-mobile-services",
    feedName: "社區創新",
    title: "流動服務如何維持一個沒有固定店面的社企",
    publishedAt: "2026-07-28T06:20:00+08:00",
  }),
  prototypeArticle({
    id: "prototype-repair-costs",
    feedName: "循環經濟",
    title: "維修網絡公布首年營運筆記與真實成本",
    publishedAt: "2026-07-28T06:00:00+08:00",
  }),
  prototypeArticle({
    id: "prototype-cantonese-voice",
    feedName: "科技",
    title: "粵語語音模型公開首階段用戶研究與測試限制",
    publishedAt: "2026-07-28T11:02:00+08:00",
  }),
  prototypeArticle({
    id: "prototype-device-repair",
    feedName: "社企專欄",
    title: "裝置維修社企整合回收、零件供應與技能培訓資訊",
    publishedAt: "2026-07-28T10:35:00+08:00",
  }),
  prototypeArticle({
    id: "prototype-low-power-sensors",
    feedName: "科技",
    title: "低耗能感應器進入社區服務場景的第二輪測試",
    publishedAt: "2026-07-28T09:48:00+08:00",
  }),
  prototypeArticle({
    id: "prototype-shared-tools",
    feedName: "社企專欄",
    title: "跨區共享工具網絡開始小規模會員制試行",
    publishedAt: "2026-07-28T09:10:00+08:00",
  }),
  prototypeArticle({
    id: "prototype-public-data",
    feedName: "科技",
    title: "公共數據平台加入更清晰的退出與資料刪除機制",
    publishedAt: "2026-07-28T08:42:00+08:00",
  }),
  prototypeArticle({
    id: "prototype-caregiver-employment",
    feedName: "社企專欄",
    title: "照顧者就業社企分享彈性排班的首年觀察",
    publishedAt: "2026-07-28T08:05:00+08:00",
  }),
];

function toHomepageArticle(article: PipelineArticleView): HomepageArticle {
  return {
    article,
    summary: extractArticleSummary(article),
    keyPoints: extractArticleKeyPoints(article),
    imageUrl: article.imageUrl ?? undefined,
  };
}

export function buildHomepageView(
  articles: readonly PipelineArticleView[],
): HomepageView {
  const seenArticleIds = new Set<string>();
  const homepageArticles = articles.reduce<HomepageArticle[]>((selected, article) => {
    if (selected.length >= MAX_HOMEPAGE_ARTICLES || seenArticleIds.has(article.id)) {
      return selected;
    }
    seenArticleIds.add(article.id);
    selected.push(toHomepageArticle(article));
    return selected;
  }, []);
  const completeHomepageArticles = [
    ...homepageArticles,
    ...PROTOTYPE_HOMEPAGE_ARTICLES.slice(homepageArticles.length),
  ];
  const featurePool = completeHomepageArticles.slice(3, 9);
  const topics = [
    ...new Set(
      homepageArticles
        .map(({ article }) => article.feedName.trim())
        .filter(Boolean),
    ),
  ].slice(0, 4);

  return {
    lead: completeHomepageArticles[0] ?? null,
    related: completeHomepageArticles.slice(1, 3),
    featureColumns: [featurePool.slice(0, 3), featurePool.slice(3, 6)],
    latest: completeHomepageArticles.slice(9, 15),
    topics: topics.length > 0 ? topics : [...PROTOTYPE_TOPICS],
  };
}

function formatDate(timestamp: number | null) {
  if (!timestamp) return "待更新";
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
  }).formatToParts(new Date(timestamp * 1_000));
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  return `${values.year}.${values.month}.${values.day}`;
}

function formatTime(timestamp: number | null) {
  if (!timestamp) return "—";
  return `${new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(timestamp * 1_000))} HKT`;
}

function articleHref(article: HomepageArticle) {
  return `/news/${encodeURIComponent(article.article.id)}`;
}

function StoryLink({
  article,
  children,
}: {
  article: HomepageArticle;
  children: ReactNode;
}) {
  if (article.isPrototype) return children;
  return <Link href={articleHref(article)}>{children}</Link>;
}

function ArticleImage({
  article,
  width,
  height,
  alt,
  loading = "lazy",
  fetchPriority,
}: {
  article: HomepageArticle;
  width: number;
  height: number;
  alt: string;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
}) {
  const image = (
    <img
      src={article.imageUrl ?? article.article.imageUrl ?? placeholderImageUrl(article.article.id, width, height)}
      width={width}
      height={height}
      alt={alt}
      loading={loading}
      fetchPriority={fetchPriority}
    />
  );

  if (article.isPrototype) return image;

  return (
    <Link className="news-v1-image-link" href={articleHref(article)}>
      {image}
    </Link>
  );
}

function LeadIndex({ keyPoints }: { keyPoints: string[] }) {
  if (keyPoints.length === 0) return null;
  return (
    <aside className="news-v1-lead-index" aria-label="主稿重點導讀">
      <p>KEY POINTS</p>
      <ol>
        {keyPoints.map((point, index) => (
          <li key={`${index}-${point}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <p>{point}</p>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function RelatedStory({ article }: { article: HomepageArticle }) {
  const timestamp = articleTimestamp(article.article);
  return (
    <article>
      <figure>
        <ArticleImage
          article={article}
          width={720}
          height={405}
          alt={`${article.article.title} 的新聞示意圖片`}
        />
      </figure>
      <p>
        {article.article.feedName}・{formatDate(timestamp)}
      </p>
      <h2>
        <StoryLink article={article}>{article.article.title}</StoryLink>
      </h2>
    </article>
  );
}

function FeatureStory({ article }: { article: HomepageArticle }) {
  const timestamp = articleTimestamp(article.article);
  return (
    <>
      <figure className="news-v1-column-visual">
        <ArticleImage
          article={article}
          width={960}
          height={540}
          alt={`${article.article.title} 的新聞示意圖片`}
        />
        <figcaption>
          <span>{article.article.feedName}</span>
          <span>示意圖片</span>
        </figcaption>
      </figure>
      <article className="news-v1-feature-story">
        <p className="news-v1-story-label">已核准報道・{formatDate(timestamp)}</p>
        <h4>
          <StoryLink article={article}>{article.article.title}</StoryLink>
        </h4>
        {article.summary ? <p>{article.summary}</p> : null}
        <p className="news-v1-article-meta">
          {article.article.author ?? article.article.feedName}・{formatTime(timestamp)}
        </p>
      </article>
    </>
  );
}

function ShortStory({ article }: { article: HomepageArticle }) {
  return (
    <article>
      <p>{article.article.feedName}</p>
      <h4>
        <StoryLink article={article}>{article.article.title}</StoryLink>
      </h4>
    </article>
  );
}

export function NewsHomepage({ view }: { view: HomepageView }) {
  const leadTimestamp = view.lead ? articleTimestamp(view.lead.article) : null;
  const issueDate = formatDate(leadTimestamp);

  return (
    <div className="news-v1-homepage">
      <EditorialPublicHeader issueDate={issueDate} topics={view.topics} />

      <main id="news-v1-main">
        <section className="news-v1-page-shell news-v1-hero" aria-labelledby="news-v1-lead-heading">
          <article className="news-v1-hero-copy">
            <div className="news-v1-hero-marker">
              <span aria-hidden="true" />
              <p>APPROVED NEWSROOM</p>
            </div>

            <h1 id="news-v1-lead-heading">
              {view.lead ? (
                <StoryLink article={view.lead}>{view.lead.article.title}</StoryLink>
              ) : (
                "PressReady Newsroom"
              )}
            </h1>

            <p className="news-v1-standfirst">
              {view.lead?.summary ?? "最新核准報道將在此出現，敬請稍候。"}
            </p>

            {view.lead ? (
              <div className="news-v1-story-meta">
                <p>{view.lead.article.feedName}</p>
                <time dateTime={new Date(leadTimestamp! * 1_000).toISOString()}>
                  {formatTime(leadTimestamp)}
                </time>
                <p>已核准報道</p>
              </div>
            ) : null}

            <aside className="news-v1-editorial-note" aria-label="編輯摘要">
              <p>EDITOR&apos;S NOTE</p>
              <p>
                PressReady 將通過編輯流程的報道整理成清晰、可閱讀的公開新聞。
              </p>
            </aside>

            {view.lead ? <LeadIndex keyPoints={view.lead.keyPoints} /> : null}
          </article>

          <div className="news-v1-hero-media">
            {view.lead ? (
              <figure className="news-v1-hero-visual">
                <ArticleImage
                  article={view.lead}
                  width={1200}
                  height={800}
                  alt={`${view.lead.article.title} 的封面新聞示意圖片`}
                  loading="eager"
                  fetchPriority="high"
                />
                <figcaption>
                  <span>PressReady / Approved report</span>
                  <span>示意圖片</span>
                </figcaption>
              </figure>
            ) : (
              <div className="news-v1-hero-empty" role="status">
                <strong>暫時沒有已核准報道</strong>
                <span>文章通過編輯流程後，會在這裡公開。</span>
              </div>
            )}
          </div>

          {view.related.length > 0 ? (
            <div className="news-v1-hero-support" aria-label="延伸閱讀">
              <header>
                <p>RELATED</p>
                <h2>延伸閱讀</h2>
                <span>{String(view.related.length).padStart(2, "0")} STORIES</span>
              </header>
              {view.related.map((article) => (
                <RelatedStory key={article.article.id} article={article} />
              ))}
            </div>
          ) : null}
        </section>

        {view.featureColumns.length > 0 ? (
          <section
            className="news-v1-page-shell news-v1-focus-section"
            id="news-v1-features"
            aria-labelledby="news-v1-focus-heading"
          >
            <header className="news-v1-section-heading">
              <div>
                <p>01 / EDITOR&apos;S DESK</p>
                <h2 id="news-v1-focus-heading">精選報道</h2>
              </div>
              <p>FEATURES・REPORTS・FIELD NOTES</p>
            </header>

            <div className="news-v1-focus-grid">
              {view.featureColumns.map((column, index) => {
                const [feature, ...shortStories] = column;
                if (!feature) return null;
                return (
                  <section
                    className="news-v1-focus-column"
                    key={feature.article.id}
                    aria-labelledby={`news-v1-focus-column-${index}`}
                  >
                    <header className="news-v1-column-heading">
                      <p>{index === 0 ? "FEATURED REPORTS" : "MORE REPORTS"}</p>
                      <h3 id={`news-v1-focus-column-${index}`}>
                        {index === 0 ? "編輯精選" : "更多報道"}
                      </h3>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                    </header>

                    <FeatureStory article={feature} />
                    {shortStories.length > 0 ? (
                      <div className="news-v1-short-list">
                        {shortStories.map((article) => (
                          <ShortStory key={article.article.id} article={article} />
                        ))}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          </section>
        ) : null}

        {view.latest.length > 0 ? (
          <section
            className="news-v1-page-shell news-v1-latest-section"
            id="news-v1-latest"
            aria-labelledby="news-v1-latest-heading"
          >
            <header className="news-v1-section-heading">
              <div>
                <p>02 / LATEST NOTES</p>
                <h2 id="news-v1-latest-heading">最新短訊</h2>
              </div>
              <p>{issueDate}・持續更新</p>
            </header>

            <ol className="news-v1-latest-list">
              {view.latest.map((article) => {
                const timestamp = articleTimestamp(article.article);
                return (
                  <li key={article.article.id}>
                    <time dateTime={new Date(timestamp * 1_000).toISOString()}>
                      {formatTime(timestamp)}
                    </time>
                    <p>{article.article.feedName}</p>
                    <h3>
                      <StoryLink article={article}>{article.article.title}</StoryLink>
                    </h3>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}
      </main>

      <EditorialPublicFooter />
    </div>
  );
}
