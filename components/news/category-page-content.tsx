import Link from "next/link";

import {
  articleDisplayTitle,
  articleTimestamp,
  extractArticleSummary,
} from "@/components/news/article-content";
import {
  EditorialPublicFooter,
  EditorialPublicHeader,
} from "@/components/news/editorial-public-chrome";
import type { PipelineArticleView } from "@/lib/shared/feeds-contracts";
import {
  NEWS_CATEGORIES,
  newsCategoryDefinition,
  type NewsCategory,
} from "@/lib/shared/news-categories";

import styles from "./category-page.module.css";

interface CategoryPageContentProps {
  articles: readonly PipelineArticleView[];
  category: NewsCategory;
  loadFailed?: boolean;
}

function formatArchiveDate(timestamp: number) {
  return new Intl.DateTimeFormat("zh-HK", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
  }).format(new Date(timestamp * 1_000));
}

function formatIssueDate(timestamp: number | undefined) {
  if (!timestamp) return "等待新報道";

  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
  }).formatToParts(new Date(timestamp * 1_000));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}.${values.month}.${values.day}`;
}

function articleHref(article: PipelineArticleView) {
  return `/news/${encodeURIComponent(article.id)}`;
}

function ArchiveImage({ article, title }: { article: PipelineArticleView; title: string }) {
  const href = articleHref(article);

  return (
    <Link className={styles.imageLink} href={href} aria-label={`閱讀：${title}`}>
      {article.imageUrl ? (
        // Arbitrary editor-supplied hosts cannot be safely enumerated in Next image remotePatterns.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.imageUrl}
          alt={`${title} 的新聞圖片`}
          width={720}
          height={405}
          loading="lazy"
        />
      ) : (
        <span className={styles.imagePlaceholder} aria-hidden="true">
          <span>PRESSREADY</span>
          <strong>圖片待更新</strong>
        </span>
      )}
    </Link>
  );
}

export function CategoryPageContent({
  articles,
  category,
  loadFailed = false,
}: CategoryPageContentProps) {
  const definition = newsCategoryDefinition(category);
  const latestTimestamp = articles[0] ? articleTimestamp(articles[0]) : undefined;
  const topics = NEWS_CATEGORIES.map(({ label }) => label);

  return (
    <div className={`news-v1-homepage ${styles.archive}`}>
      <EditorialPublicHeader
        issueDate={formatIssueDate(latestTimestamp)}
        issueLabel={`${definition.englishLabel.toUpperCase()} ARCHIVE`}
        topics={topics}
      />

      <main id="news-v1-main">
        <header className={styles.masthead}>
          <div className={`news-v1-page-shell ${styles.mastheadInner}`}>
            <div className={styles.marker} aria-hidden="true">
              <span />
              <p>{definition.englishLabel}</p>
            </div>
            <div className={styles.headingGroup}>
              <div>
                <h1>{definition.label}</h1>
                <p>{definition.description}</p>
              </div>
              <p className={styles.reportCount} aria-label={`${articles.length} 篇已刊登報道`}>
                <strong>{String(articles.length).padStart(2, "0")}</strong>
                <span>篇已刊登報道</span>
              </p>
            </div>
          </div>
        </header>

        <section className={`news-v1-page-shell ${styles.reports}`} aria-labelledby="category-reports-title">
          <div className={styles.sectionHeading}>
            <p>REPORT ARCHIVE</p>
            <h2 id="category-reports-title">全部{definition.label}報道</h2>
          </div>

          {articles.length > 0 ? (
            <ol className={styles.reportList}>
              {articles.map((article) => {
                const title = articleDisplayTitle(article);
                const summary = extractArticleSummary(article);
                const timestamp = articleTimestamp(article);

                return (
                  <li key={article.id}>
                    <article className={styles.report}>
                      <ArchiveImage article={article} title={title} />
                      <div className={styles.reportCopy}>
                        <p className={styles.categoryLabel}>{definition.label}・已核准報道</p>
                        <h2>
                          <Link href={articleHref(article)}>{title}</Link>
                        </h2>
                        {summary ? <p className={styles.summary}>{summary}</p> : null}
                        <div className={styles.meta}>
                          <time dateTime={new Date(timestamp * 1_000).toISOString()}>
                            {formatArchiveDate(timestamp)}
                          </time>
                          {article.author ? <span>撰文・{article.author}</span> : null}
                        </div>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className={styles.emptyState} role="status">
              <p>{loadFailed ? "ARCHIVE TEMPORARILY UNAVAILABLE" : "REPORTS IN PREPARATION"}</p>
              <h2>{loadFailed ? "暫時未能載入報道" : `首批${definition.label}報道正在準備中`}</h2>
              <p>
                {loadFailed
                  ? "新聞庫目前未能連線，請稍後再試；首頁仍可繼續瀏覽。"
                  : "編輯團隊會在核准報道後更新這個專頁。你亦可先返回首頁閱讀最新內容。"}
              </p>
              <Link href="/">
                返回首頁 <span aria-hidden="true">→</span>
              </Link>
            </div>
          )}
        </section>
      </main>

      <EditorialPublicFooter />
    </div>
  );
}
