import Link from "next/link";

import {
  articleBodyParagraphs,
  articleDisplayTitle,
  articleTimestamp,
  extractArticleKeyPoints,
  extractArticleSummary,
  placeholderImageUrl,
} from "@/components/news/article-content";
import { EditorialPublicFooter, EditorialPublicHeader } from "@/components/news/editorial-public-chrome";
import type { PipelineArticleView } from "@/lib/shared/feeds-contracts";
import { newsCategoryDefinition } from "@/lib/shared/news-categories";

function formatArticleDate(timestamp: number | null) {
  if (!timestamp) return "待更新";
  return new Intl.DateTimeFormat("zh-HK", {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
  }).format(new Date(timestamp * 1_000));
}

function safeSourceName(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return "原始報道";
  }
}

function articleHref(article: PipelineArticleView) {
  return `/news/${encodeURIComponent(article.id)}`;
}

export function NewsArticlePageContent({
  article,
  related,
}: {
  article: PipelineArticleView;
  related: readonly PipelineArticleView[];
}) {
  const body = articleBodyParagraphs(article);
  const title = articleDisplayTitle(article);
  const deck = extractArticleSummary(article);
  const keyPoints = extractArticleKeyPoints(article);
  const timestamp = articleTimestamp(article);
  const category = article.category
    ? newsCategoryDefinition(article.category)
    : null;
  const topics = [
    ...new Set([
      ...(category ? [category.label] : []),
      article.feedName,
      ...related.map(({ feedName }) => feedName),
    ]),
  ];

  return (
    <div className="news-v1-article-page">
      <EditorialPublicHeader
        issueDate={formatArticleDate(timestamp)}
        issueLabel="APPROVED REPORT"
        topics={topics}
      />

      <main className="news-v1-article-main" id="news-v1-main">
        <article className="news-v1-article" aria-labelledby="article-title">
          <header className="news-v1-article-heading news-v1-page-shell">
            <nav className="news-v1-article-breadcrumb" aria-label="文章導覽">
              <Link href="/">← 所有已核准報道</Link>
              {category ? (
                <>
                  <span aria-hidden="true">/</span>
                  <Link href={category.href}>{category.label}</Link>
                </>
              ) : null}
            </nav>
            <p className="news-v1-article-kicker">
              {category?.label ?? article.feedName}・已核准報道
            </p>
            <h1 id="article-title">{title}</h1>
            {deck ? <p className="news-v1-article-deck">{deck}</p> : null}

            <dl className="news-v1-article-metadata">
              <div>
                <dt>NEWS DESK</dt>
                <dd>{article.feedName}</dd>
              </div>
              <div>
                <dt>PUBLISHED</dt>
                <dd>
                  <time dateTime={new Date(timestamp * 1_000).toISOString()}>
                    {formatArticleDate(timestamp)}
                  </time>
                </dd>
              </div>
              <div>
                <dt>ORIGINAL SOURCE</dt>
                <dd>
                  <a href={article.url} target="_blank" rel="noopener noreferrer">
                    {safeSourceName(article.url)} <span aria-hidden="true">↗</span>
                  </a>
                </dd>
              </div>
            </dl>
          </header>

          <figure className="news-v1-article-hero">
            {/* Arbitrary editor-supplied hosts cannot be safely enumerated in Next image remotePatterns. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={article.imageUrl ?? placeholderImageUrl(article.id, 1200, 675)}
              width={1200}
              height={675}
              alt={`${title} 的新聞圖片`}
              loading="eager"
              fetchPriority="high"
            />
            <figcaption className="news-v1-page-shell">
              <span>PressReady / Approved report</span>
              <span>{article.imageUrl ? "精選圖片" : "示意圖片"}</span>
            </figcaption>
          </figure>

          <div className="news-v1-page-shell news-v1-article-layout">
            <div className="news-v1-article-reading">
              {body.map((paragraph, index) => (
                <p className={index === 0 ? "news-v1-article-lede" : undefined} key={`${index}-${paragraph}`}>
                  {paragraph}
                </p>
              ))}
            </div>

            {keyPoints.length > 0 || related.length > 0 ? (
              <aside className="news-v1-article-aside" aria-label="延伸閱讀">
                {keyPoints.length > 0 ? (
                  <section className="news-v1-article-points" aria-labelledby="article-key-points">
                    <p>KEY POINTS</p>
                    <h2 id="article-key-points">報道重點</h2>
                    <ol>
                      {keyPoints.map((point, index) => (
                        <li key={`${index}-${point}`}>
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          <p>{point}</p>
                        </li>
                      ))}
                    </ol>
                  </section>
                ) : null}

                {related.length > 0 ? (
                  <section className="news-v1-article-related" aria-labelledby="article-related-stories">
                    <p>RELATED REPORTS</p>
                    <h2 id="article-related-stories">延伸報道</h2>
                    <ul>
                      {related.map((relatedArticle) => (
                        <li key={relatedArticle.id}>
                          <p>{relatedArticle.feedName}</p>
                          <Link href={articleHref(relatedArticle)}>
                            {articleDisplayTitle(relatedArticle)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </aside>
            ) : null}
          </div>
        </article>

        <nav className="news-v1-page-shell news-v1-article-return" aria-label="文章導覽">
          <Link href={category?.href ?? "/"}>
            返回{category?.label ?? "所有已核准報道"} <span aria-hidden="true">→</span>
          </Link>
        </nav>
      </main>
      <EditorialPublicFooter />
    </div>
  );
}
