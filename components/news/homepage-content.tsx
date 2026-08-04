import Link from "next/link";

import {
  articleTimestamp,
  extractArticleKeyPoints,
  extractArticleSummary,
  placeholderImageUrl,
} from "@/components/news/article-content";
import { EditorialPublicFooter, EditorialPublicHeader } from "@/components/news/editorial-public-chrome";
import type { PipelineArticleView } from "@/lib/shared/feeds-contracts";

const MAX_HOMEPAGE_ARTICLES = 15;

export { extractArticleKeyPoints, extractArticleSummary, placeholderImageUrl };

export interface HomepageArticle {
  article: PipelineArticleView;
  summary: string | null;
  keyPoints: string[];
}

export interface HomepageView {
  lead: HomepageArticle | null;
  related: HomepageArticle[];
  featureColumns: HomepageArticle[][];
  latest: HomepageArticle[];
  topics: string[];
}


function toHomepageArticle(article: PipelineArticleView): HomepageArticle {
  return {
    article,
    summary: extractArticleSummary(article),
    keyPoints: extractArticleKeyPoints(article),
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
  const featurePool = homepageArticles.slice(3, 9);
  const topics = [
    ...new Set(
      homepageArticles
        .map(({ article }) => article.feedName.trim())
        .filter(Boolean),
    ),
  ].slice(0, 4);

  return {
    lead: homepageArticles[0] ?? null,
    related: homepageArticles.slice(1, 3),
    featureColumns: [featurePool.slice(0, 3), featurePool.slice(3, 6)].filter(
      (column) => column.length > 0,
    ),
    latest: homepageArticles.slice(9, 15),
    topics,
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
  return (
    <Link className="news-v1-image-link" href={articleHref(article)}>
      <img
        src={placeholderImageUrl(article.article.id, width, height)}
        width={width}
        height={height}
        alt={alt}
        loading={loading}
        fetchPriority={fetchPriority}
      />
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
        <Link href={articleHref(article)}>{article.article.title}</Link>
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
          <Link href={articleHref(article)}>{article.article.title}</Link>
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
        <Link href={articleHref(article)}>{article.article.title}</Link>
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
                <Link href={articleHref(view.lead)}>{view.lead.article.title}</Link>
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
                      <Link href={articleHref(article)}>{article.article.title}</Link>
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
