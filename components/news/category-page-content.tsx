import Link from "next/link";

import {
  articleDisplayTitle,
  articleTimestamp,
  extractArticleSummary,
} from "@/components/news/article-content";
import {
  ArticlePresentationEditorProvider,
  ArticlePresentationImage,
  ArticlePresentationText,
} from "@/components/news/article-presentation-editor";
import {
  EditorialPublicFooter,
  EditorialPublicHeader,
} from "@/components/news/editorial-public-chrome";
import type { PipelineArticleView } from "@/lib/shared/feeds-contracts";
import {
  createDefaultArticlePresentation,
  type ArticlePresentation,
} from "@/lib/shared/article-presentation";
import {
  newsCategoryDefinition,
  type NewsCategory,
} from "@/lib/shared/news-categories";
import {
  createPublicPagePresentationSource,
  presentationItemToken,
} from "@/lib/shared/public-page-presentation";

import styles from "./category-page.module.css";

interface CategoryPageContentProps {
  articles: readonly PipelineArticleView[];
  category: NewsCategory;
  loadFailed?: boolean;
  presentationDraft?: ArticlePresentation;
  publishedPresentation?: ArticlePresentation;
  canEditPresentation?: boolean;
  editPresentation?: boolean;
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

function categoryItemPrefix(
  category: NewsCategory,
  article: PipelineArticleView,
) {
  return `category:${category}:${presentationItemToken(`${article.id}:${article.updatedAt}`)}`;
}

function categoryBlockId(
  category: NewsCategory,
  article: PipelineArticleView,
  field: "title" | "deck",
) {
  return `${categoryItemPrefix(category, article)}:${field}`;
}

function categoryImageId(
  category: NewsCategory,
  article: PipelineArticleView,
) {
  return `category:${category}:${presentationItemToken(article.id)}:image`;
}

function categoryDescriptionBlockId(category: NewsCategory) {
  return `category:${category}:page:description`;
}

function categoryEmptyBlockId(
  category: NewsCategory,
  loadFailed: boolean,
  field: "heading" | "body",
) {
  return `category:${category}:empty:${loadFailed ? "error" : "preparation"}:${field}`;
}

function categoryEmptyCopy(category: NewsCategory, loadFailed: boolean) {
  const definition = newsCategoryDefinition(category);
  return loadFailed
    ? {
        heading: "暫時未能載入報道",
        body: "新聞庫目前未能連線，請稍後再試；首頁仍可繼續瀏覽。",
      }
    : {
        heading: `首批${definition.label}報道正在準備中`,
        body: "編輯團隊會在核准報道後更新這個專頁。你亦可先返回首頁閱讀最新內容。",
      };
}

export function categoryPresentationSource(
  articles: readonly PipelineArticleView[],
  category: NewsCategory,
  loadFailed = false,
) {
  const definition = newsCategoryDefinition(category);
  const blocks: { id: string; text: string }[] = [
    {
      id: categoryDescriptionBlockId(category),
      text: definition.description,
    },
  ];
  const imageIds: string[] = [];
  const legacyImageIdsBySourceId: Record<string, string[]> = {};
  articles.forEach((article) => {
    blocks.push({
      id: categoryBlockId(category, article, "title"),
      text: articleDisplayTitle(article),
    });
    const summary = extractArticleSummary(article);
    if (summary) {
      blocks.push({
        id: categoryBlockId(category, article, "deck"),
        text: summary,
      });
    }
    const imageId = categoryImageId(category, article);
    imageIds.push(imageId);
    legacyImageIdsBySourceId[imageId] = [
      `${categoryItemPrefix(category, article)}:image`,
    ];
  });
  if (articles.length === 0) {
    const emptyCopy = categoryEmptyCopy(category, loadFailed);
    blocks.push(
      {
        id: categoryEmptyBlockId(category, loadFailed, "heading"),
        text: emptyCopy.heading,
      },
      {
        id: categoryEmptyBlockId(category, loadFailed, "body"),
        text: emptyCopy.body,
      },
    );
  }
  return createPublicPagePresentationSource(
    category,
    blocks,
    imageIds,
    legacyImageIdsBySourceId,
  );
}

function ArchiveImage({
  article,
  title,
  imageId,
  editing,
  presentation,
}: {
  article: PipelineArticleView;
  title: string;
  imageId: string;
  editing: boolean;
  presentation: boolean;
}) {
  const href = articleHref(article);

  const image = article.imageUrl ? (
    presentation ? (
      <ArticlePresentationImage
        imageId={imageId}
        src={article.imageUrl}
        alt={`${title} 的新聞圖片`}
        intrinsicWidth={720}
        intrinsicHeight={405}
      />
    ) : (
      // Arbitrary editor-supplied hosts cannot be safely enumerated in Next image remotePatterns.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={article.imageUrl}
        alt={`${title} 的新聞圖片`}
        width={720}
        height={405}
        loading="lazy"
      />
    )
  ) : (
    <span className={styles.imagePlaceholder} aria-hidden="true">
      <span>PRESSREADY</span>
      <strong>圖片待更新</strong>
    </span>
  );

  if (editing) {
    return <div className={styles.imageLink}>{image}</div>;
  }

  return (
    <Link className={styles.imageLink} href={href} aria-label={`閱讀：${title}`}>
      {image}
    </Link>
  );
}

export function CategoryPageContent({
  articles,
  category,
  loadFailed = false,
  presentationDraft,
  publishedPresentation,
  canEditPresentation = false,
  editPresentation = false,
}: CategoryPageContentProps) {
  const definition = newsCategoryDefinition(category);
  const latestTimestamp = articles[0] ? articleTimestamp(articles[0]) : undefined;
  const pageSource = categoryPresentationSource(articles, category, loadFailed);
  const defaultPresentation = pageSource.sourceBlocks.length
    ? createDefaultArticlePresentation(
        pageSource.sourceUpdatedAt,
        pageSource.sourceBlocks,
        pageSource.sourceImageIds,
      )
    : null;
  const effectiveDraft = presentationDraft ?? defaultPresentation;
  const effectivePublished = publishedPresentation ?? defaultPresentation;
  const presentationAvailable = Boolean(effectiveDraft && effectivePublished);

  const mainContent = (
    <>
      {canEditPresentation && presentationAvailable && !editPresentation ? (
        <div className="news-presentation-entry news-v1-page-shell">
          <Link href={`/${category}?edit=1`}>Edit page</Link>
        </div>
      ) : null}

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
                <p>
                  <ArticlePresentationText
                    blockId={categoryDescriptionBlockId(category)}
                    text={definition.description}
                  />
                </p>
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
                      <ArchiveImage
                        article={article}
                        title={title}
                        imageId={categoryImageId(category, article)}
                        editing={editPresentation}
                        presentation={presentationAvailable}
                      />
                      <div className={styles.reportCopy}>
                        <p className={styles.categoryLabel}>{definition.label}・已核准報道</p>
                        <h2>
                          {editPresentation ? (
                            <ArticlePresentationText
                              blockId={categoryBlockId(category, article, "title")}
                              text={title}
                            />
                          ) : (
                            <Link href={articleHref(article)}>
                              <ArticlePresentationText
                                blockId={categoryBlockId(category, article, "title")}
                                text={title}
                              />
                            </Link>
                          )}
                        </h2>
                        {summary ? (
                          <p className={styles.summary}>
                            <ArticlePresentationText
                              blockId={categoryBlockId(category, article, "deck")}
                              text={summary}
                            />
                          </p>
                        ) : null}
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
              <h2>
                <ArticlePresentationText
                  blockId={categoryEmptyBlockId(category, loadFailed, "heading")}
                  text={categoryEmptyCopy(category, loadFailed).heading}
                />
              </h2>
              <p>
                <ArticlePresentationText
                  blockId={categoryEmptyBlockId(category, loadFailed, "body")}
                  text={categoryEmptyCopy(category, loadFailed).body}
                />
              </p>
              <Link href="/">
                返回首頁 <span aria-hidden="true">→</span>
              </Link>
            </div>
          )}
        </section>
      </main>
    </>
  );

  return (
    <div className={`news-v1-homepage ${styles.archive}`}>
      <EditorialPublicHeader
        issueDate={formatIssueDate(latestTimestamp)}
        issueLabel={`${definition.englishLabel.toUpperCase()} ARCHIVE`}
      />

      {presentationAvailable && effectiveDraft && effectivePublished ? (
        <ArticlePresentationEditorProvider
          key={`${category}:${editPresentation ? "edit" : "read"}:${effectiveDraft.sourceUpdatedAt}:${effectivePublished.sourceUpdatedAt}`}
          publicPageKey={category}
          editMode={editPresentation}
          initialDraft={effectiveDraft}
          initialPublished={effectivePublished}
          exitHref={`/${category}`}
          editorLabel={`${definition.englishLabel} archive`}
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
