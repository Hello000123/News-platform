import Link from "next/link";
import type { ReactNode } from "react";

import {
  articleDisplayTitle,
  articlePresentationSourceBlocks,
  articleTimestamp,
  extractArticleKeyPoints,
  extractArticleSummary,
  placeholderImageUrl,
} from "@/components/news/article-content";
import {
  ArticlePresentationEditorProvider,
  ArticlePresentationImage,
  ArticlePresentationText,
} from "@/components/news/article-presentation-editor";
import { EditorialPublicFooter, EditorialPublicHeader } from "@/components/news/editorial-public-chrome";
import {
  createDefaultArticlePresentation,
  type ArticlePresentation,
} from "@/lib/shared/article-presentation";
import type { PipelineArticleView } from "@/lib/shared/feeds-contracts";
import {
  NEWS_CATEGORIES,
  type NewsCategory,
  type NewsCategoryDefinition,
} from "@/lib/shared/news-categories";

const CATEGORY_SHELF_SIZE = 3;
const PROTOTYPE_TOPICS = ["生成式 AI", "數碼共融", "社區創新", "影響力營運"];

export {
  articleDisplayTitle,
  extractArticleKeyPoints,
  extractArticleSummary,
  placeholderImageUrl,
};

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
  categoryShelves: HomepageCategoryShelf[];
  latest: HomepageArticle[];
  topics: string[];
}

export interface HomepageCategoryShelf {
  category: NewsCategoryDefinition;
  articles: HomepageArticle[];
}

interface PrototypeArticleDefinition {
  id: string;
  feedName: string;
  title: string;
  category: NewsCategory;
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
  category,
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
      category,
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
    category: "technology",
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
    category: "technology",
    publishedAt: "2026-07-28T08:10:00+08:00",
    imageUrl: "https://picsum.photos/seed/accessible-ai/720/405.webp?grayscale",
  }),
  prototypeArticle({
    id: "prototype-repair-network",
    feedName: "社企專欄",
    title: "維修社企如何把技能、零件與社區需要連起來",
    category: "social-enterprise",
    publishedAt: "2026-07-28T07:55:00+08:00",
    imageUrl: "https://picsum.photos/seed/repair-network/720/405.webp?grayscale",
  }),
  prototypeArticle({
    id: "prototype-open-source-tech",
    feedName: "科技",
    title: "開源團隊重新設計繁體中文模型的評測方法",
    category: "technology",
    summary: "新框架不只比較答案正確率，也把粵語語境、資料透明度與實際使用情境納入測試。",
    author: "何日安",
    publishedAt: "2026-07-28T07:40:00+08:00",
    imageUrl: "https://picsum.photos/seed/open-source-tech/960/540.webp?grayscale",
  }),
  prototypeArticle({
    id: "prototype-ai-product-team",
    feedName: "產品與數據",
    title: "小型團隊開始評估 AI 工具真正節省的工時",
    category: "technology",
    publishedAt: "2026-07-28T07:20:00+08:00",
  }),
  prototypeArticle({
    id: "prototype-inclusive-design",
    feedName: "數碼共融",
    title: "無障礙設計正在成為產品開發的基本功",
    category: "technology",
    publishedAt: "2026-07-28T07:00:00+08:00",
  }),
  prototypeArticle({
    id: "prototype-shared-kitchen",
    feedName: "社企專欄",
    title: "共享廚房如何在使命、成本與成長之間建立平衡",
    category: "social-enterprise",
    summary: "團隊把共同採購、人才培訓與會員制度放進同一營運模型，尋找能夠長期延續的收入。",
    author: "梁文希",
    publishedAt: "2026-07-28T06:40:00+08:00",
    imageUrl: "https://picsum.photos/seed/social-enterprise/960/540.webp?grayscale",
  }),
  prototypeArticle({
    id: "prototype-mobile-services",
    feedName: "社區創新",
    title: "流動服務如何維持一個沒有固定店面的社企",
    category: "social-enterprise",
    publishedAt: "2026-07-28T06:20:00+08:00",
  }),
  prototypeArticle({
    id: "prototype-repair-costs",
    feedName: "循環經濟",
    title: "維修網絡公布首年營運筆記與真實成本",
    category: "social-enterprise",
    publishedAt: "2026-07-28T06:00:00+08:00",
  }),
  prototypeArticle({
    id: "prototype-cantonese-voice",
    feedName: "科技",
    title: "粵語語音模型公開首階段用戶研究與測試限制",
    category: "technology",
    publishedAt: "2026-07-28T11:02:00+08:00",
  }),
  prototypeArticle({
    id: "prototype-device-repair",
    feedName: "社企專欄",
    title: "裝置維修社企整合回收、零件供應與技能培訓資訊",
    category: "social-enterprise",
    publishedAt: "2026-07-28T10:35:00+08:00",
  }),
  prototypeArticle({
    id: "prototype-low-power-sensors",
    feedName: "科技",
    title: "低耗能感應器進入社區服務場景的第二輪測試",
    category: "technology",
    publishedAt: "2026-07-28T09:48:00+08:00",
  }),
  prototypeArticle({
    id: "prototype-shared-tools",
    feedName: "社企專欄",
    title: "跨區共享工具網絡開始小規模會員制試行",
    category: "social-enterprise",
    publishedAt: "2026-07-28T09:10:00+08:00",
  }),
  prototypeArticle({
    id: "prototype-public-data",
    feedName: "科技",
    title: "公共數據平台加入更清晰的退出與資料刪除機制",
    category: "technology",
    publishedAt: "2026-07-28T08:42:00+08:00",
  }),
  prototypeArticle({
    id: "prototype-caregiver-employment",
    feedName: "社企專欄",
    title: "照顧者就業社企分享彈性排班的首年觀察",
    category: "social-enterprise",
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
    if (article.status !== "approved" || seenArticleIds.has(article.id)) {
      return selected;
    }
    seenArticleIds.add(article.id);
    selected.push(toHomepageArticle(article));
    return selected;
  }, []).sort(
    (left, right) => articleTimestamp(right.article) - articleTimestamp(left.article),
  );
  const completeHomepageArticles = [...homepageArticles, ...PROTOTYPE_HOMEPAGE_ARTICLES];
  const related = completeHomepageArticles
    .filter((item) => item.article.id !== completeHomepageArticles[0]?.article.id)
    .slice(0, 2);
  const categoryShelves = NEWS_CATEGORIES.map((category) => {
    const categoryArticles = homepageArticles.filter(
      ({ article }) => article.category === category.value,
    );
    const prototypeArticles = PROTOTYPE_HOMEPAGE_ARTICLES.filter(
      ({ article }) => article.category === category.value,
    );

    return {
      category,
      articles: [...categoryArticles, ...prototypeArticles].slice(0, CATEGORY_SHELF_SIZE),
    };
  });
  const topics = [
    ...new Set(
      homepageArticles
        .map(({ article }) => article.feedName.trim())
        .filter(Boolean),
    ),
  ].slice(0, 4);

  return {
    lead: completeHomepageArticles[0] ?? null,
    related,
    categoryShelves,
    latest: homepageArticles.length > 0 ? homepageArticles : [...PROTOTYPE_HOMEPAGE_ARTICLES],
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

function homepageArticleTitle(article: HomepageArticle) {
  return articleDisplayTitle(article.article);
}

function homepageArticleCategoryLabel(article: HomepageArticle) {
  return NEWS_CATEGORIES.find(
    ({ value }) => value === article.article.category,
  )?.label ?? article.article.feedName;
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
  presentation = false,
  disableLink = false,
}: {
  article: HomepageArticle;
  width: number;
  height: number;
  alt: string;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
  presentation?: boolean;
  disableLink?: boolean;
}) {
  const source =
    article.imageUrl ??
    article.article.imageUrl ??
    placeholderImageUrl(article.article.id, width, height);
  const image = presentation ? (
    <ArticlePresentationImage
      src={source}
      alt={alt}
      intrinsicWidth={width}
      intrinsicHeight={height}
    />
  ) : (
    // Arbitrary editor-supplied hosts cannot be safely enumerated in Next image remotePatterns.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={source}
      width={width}
      height={height}
      alt={alt}
      loading={loading}
      fetchPriority={fetchPriority}
    />
  );

  if (article.isPrototype || disableLink) return image;

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
  const title = homepageArticleTitle(article);
  return (
    <article>
      <figure>
        <ArticleImage
          article={article}
          width={720}
          height={405}
          alt={`${title} 的新聞示意圖片`}
        />
      </figure>
      <p>
        {article.article.feedName}・{formatDate(timestamp)}
      </p>
      <h3>
        <StoryLink article={article}>{title}</StoryLink>
      </h3>
    </article>
  );
}

function CategoryFeature({ article }: { article: HomepageArticle }) {
  const timestamp = articleTimestamp(article.article);
  const title = homepageArticleTitle(article);
  return (
    <div className="news-v1-category-feature">
      <figure>
        <ArticleImage
          article={article}
          width={720}
          height={450}
          alt={`${title} 的分類新聞圖片`}
        />
      </figure>
      <article>
        <p className="news-v1-story-label">
          {homepageArticleCategoryLabel(article)}・{formatDate(timestamp)}
        </p>
        <h3>
          <StoryLink article={article}>{title}</StoryLink>
        </h3>
        {article.summary ? <p>{article.summary}</p> : null}
        <p className="news-v1-article-meta">
          {article.article.author ?? article.article.feedName}・{formatTime(timestamp)}
        </p>
      </article>
    </div>
  );
}

function CategorySupportStory({ article }: { article: HomepageArticle }) {
  const timestamp = articleTimestamp(article.article);
  const title = homepageArticleTitle(article);
  return (
    <article>
      <figure>
        <ArticleImage
          article={article}
          width={240}
          height={150}
          alt={`${title} 的分類新聞圖片`}
        />
      </figure>
      <div>
        <p>{formatDate(timestamp)}</p>
        <h3>
          <StoryLink article={article}>{title}</StoryLink>
        </h3>
      </div>
    </article>
  );
}

function CategoryShelf({ shelf }: { shelf: HomepageCategoryShelf }) {
  const [feature, ...supports] = shelf.articles;
  const headingId = `news-v1-category-${shelf.category.value}`;

  if (!feature) return null;

  return (
    <section
      className="news-v1-category-shelf"
      id={`news-v1-${shelf.category.value}`}
      aria-labelledby={headingId}
    >
      <header className="news-v1-category-heading">
        <div>
          <p>{shelf.category.englishLabel.toUpperCase()}</p>
          <h2 id={headingId}>{shelf.category.label}</h2>
        </div>
        <div>
          <span>{String(shelf.articles.length).padStart(2, "0")} STORIES</span>
          <Link href={shelf.category.href}>查看全部</Link>
        </div>
      </header>

      <CategoryFeature article={feature} />
      {supports.length > 0 ? (
        <div className="news-v1-category-supports">
          {supports.map((article) => (
            <CategorySupportStory key={article.article.id} article={article} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function NewsHomepage({
  view,
  presentationDraft,
  publishedPresentation,
  canEditPresentation = false,
  editPresentation = false,
}: {
  view: HomepageView;
  presentationDraft?: ArticlePresentation;
  publishedPresentation?: ArticlePresentation;
  canEditPresentation?: boolean;
  editPresentation?: boolean;
}) {
  const leadTimestamp = view.lead ? articleTimestamp(view.lead.article) : null;
  const leadTitle = view.lead ? homepageArticleTitle(view.lead) : null;
  const issueDate = formatDate(leadTimestamp);
  const presentationAvailable = Boolean(
    view.lead &&
      !view.lead.isPrototype &&
      presentationDraft &&
      publishedPresentation,
  );
  const defaultPresentation = view.lead
    ? createDefaultArticlePresentation(
        view.lead.article.updatedAt,
        articlePresentationSourceBlocks(view.lead.article),
      )
    : null;
  const effectiveDraft = presentationDraft ?? defaultPresentation;
  const effectivePublished = publishedPresentation ?? defaultPresentation;

  const mainContent = (
    <>
      {canEditPresentation && presentationAvailable && !editPresentation ? (
        <div className="news-presentation-entry news-v1-page-shell">
          <Link href="/?edit=1">Edit front page lead</Link>
        </div>
      ) : null}

      <main id="news-v1-main">
        <section className="news-v1-page-shell news-v1-hero" aria-labelledby="news-v1-lead-heading">
          <article className="news-v1-hero-copy">
            <div className="news-v1-hero-marker">
              <span aria-hidden="true" />
              <p>
                TOP STORY
                {view.lead ? ` / ${homepageArticleCategoryLabel(view.lead)}` : ""}
              </p>
            </div>

            <h1 id="news-v1-lead-heading">
              {view.lead ? (
                editPresentation && presentationAvailable ? (
                  <ArticlePresentationText blockId="title" text={leadTitle ?? ""} />
                ) : (
                  <StoryLink article={view.lead}>
                    {presentationAvailable ? (
                      <ArticlePresentationText blockId="title" text={leadTitle ?? ""} />
                    ) : (
                      leadTitle
                    )}
                  </StoryLink>
                )
              ) : (
                "PressReady Newsroom"
              )}
            </h1>

            <p className="news-v1-standfirst">
              {view.lead?.summary ? (
                presentationAvailable ? (
                  <ArticlePresentationText blockId="deck" text={view.lead.summary} />
                ) : (
                  view.lead.summary
                )
              ) : (
                "最新核准報道將在此出現，敬請稍候。"
              )}
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

          </article>

          <div className="news-v1-hero-media">
            {view.lead ? (
              <figure className="news-v1-hero-visual">
                <ArticleImage
                  article={view.lead}
                  width={1200}
                  height={800}
                  alt={`${leadTitle} 的封面新聞示意圖片`}
                  loading="eager"
                  fetchPriority="high"
                  presentation={presentationAvailable}
                  disableLink={editPresentation}
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

          {view.lead ? <LeadIndex keyPoints={view.lead.keyPoints} /> : null}

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

        {view.categoryShelves.length > 0 ? (
          <div className="news-v1-page-shell news-v1-category-grid">
            {view.categoryShelves.map((shelf) => (
              <CategoryShelf key={shelf.category.value} shelf={shelf} />
            ))}
          </div>
        ) : null}

        {view.latest.length > 0 ? (
          <section
            className="news-v1-page-shell news-v1-latest-section"
            id="news-v1-latest"
            aria-labelledby="news-v1-latest-heading"
          >
            <header className="news-v1-section-heading">
              <div>
                <p>03 / LATEST NOTES</p>
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
                    <p>{homepageArticleCategoryLabel(article)}</p>
                    <h3>
                      <StoryLink article={article}>{homepageArticleTitle(article)}</StoryLink>
                    </h3>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}
      </main>
    </>
  );

  return (
    <div className="news-v1-homepage">
      <EditorialPublicHeader issueDate={issueDate} topics={view.topics} />
      {presentationAvailable && view.lead && effectiveDraft && effectivePublished ? (
        <ArticlePresentationEditorProvider
          articleId={view.lead.article.id}
          editMode={editPresentation}
          initialDraft={effectiveDraft}
          initialPublished={effectivePublished}
          exitHref="/"
          editorLabel="front page lead"
        >
          {mainContent}
        </ArticlePresentationEditorProvider>
      ) : (
        mainContent
      )}
      <EditorialPublicFooter />
    </div>
  );
}
