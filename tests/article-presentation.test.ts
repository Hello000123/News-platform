import { readFile } from "node:fs/promises";

import type { D1Database } from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import { describe, expect, it } from "vitest";

import { articlePresentationSourceBlocks } from "@/components/news/article-content";
import {
  getArticlePresentationState,
  getPublishedArticlePresentation,
  publishArticlePresentation,
  saveArticlePresentationDraft,
} from "@/lib/server/article-presentation";
import { getPipelineArticleById } from "@/lib/server/feeds/repository";
import {
  applyArticleTextStyle,
  articlePresentationBlockText,
  createDefaultArticlePresentation,
  replaceArticleText,
  validateArticlePresentation,
  type ArticlePresentation,
} from "@/lib/shared/article-presentation";

async function executeSqlScript(database: D1Database, sql: string) {
  for (const statement of sql
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean)) {
    await database.prepare(statement).run();
  }
}

const sourceBlocks = [
  { id: "title", text: "A fixed headline" },
  { id: "body:0", text: "Immutable article text." },
];

describe("restricted article presentation model", () => {
  it("formats only the selected text and preserves every other segment style", () => {
    const initial = createDefaultArticlePresentation(20, sourceBlocks);
    const formatted = applyArticleTextStyle(initial, "body:0", 0, 9, {
      fontFamily: "sans",
      fontSize: 24,
      bold: true,
      italic: true,
      underline: true,
      strikethrough: true,
      script: "superscript",
      highlightColor: "#fff59d",
      fontColor: "#245b88",
    });

    expect(formatted.blocks[1].segments).toEqual([
      expect.objectContaining({
        text: "Immutable",
        fontFamily: "sans",
        fontSize: 24,
        bold: true,
        italic: true,
        underline: true,
        strikethrough: true,
        script: "superscript",
        highlightColor: "#fff59d",
        fontColor: "#245b88",
      }),
      expect.objectContaining({
        text: " article text.",
        fontFamily: null,
        fontSize: null,
      }),
    ]);
    expect(
      formatted.blocks[1].segments.map((segment) => segment.text).join(""),
    ).toBe(sourceBlocks[1].text);
  });

  it("allows plain-text edits while rejecting empty blocks, structure changes, unsafe styles, and invalid images", () => {
    const initial = createDefaultArticlePresentation(20, sourceBlocks);
    const changedText = replaceArticleText(initial, "title", 2, 7, "revised");
    expect(
      articlePresentationBlockText(
        validateArticlePresentation(changedText, 20, sourceBlocks),
        "title",
      ),
    ).toBe("A revised headline");

    const emptyTitle = replaceArticleText(initial, "title", 0, sourceBlocks[0].text.length, "");
    expect(() =>
      validateArticlePresentation(emptyTitle, 20, sourceBlocks),
    ).toThrow(/cannot be left empty/iu);

    const reordered = { ...initial, blocks: [...initial.blocks].reverse() };
    expect(() =>
      validateArticlePresentation(reordered, 20, sourceBlocks),
    ).toThrow(/moved or reordered/iu);

    expect(() =>
      validateArticlePresentation(
        {
          ...initial,
          blocks: initial.blocks.map((block, index) =>
            index === 0
              ? {
                  ...block,
                  segments: [
                    {
                      ...block.segments[0],
                      fontFamily: "url(https://example.test/font)",
                    },
                  ],
                }
              : block,
          ),
        },
        20,
        sourceBlocks,
      ),
    ).toThrow();
    expect(() =>
      validateArticlePresentation(
        {
          ...initial,
          blocks: initial.blocks.map((block, index) =>
            index === 0
              ? {
                  ...block,
                  segments: [
                    {
                      ...block.segments[0],
                      fontColor: "red; background:url(https://example.test)",
                    },
                  ],
                }
              : block,
          ),
        },
        20,
        sourceBlocks,
      ),
    ).toThrow();
    expect(() =>
      validateArticlePresentation(
        { ...initial, imageScalePercent: 101 },
        20,
        sourceBlocks,
      ),
    ).toThrow();
    expect(() =>
      validateArticlePresentation(
        { ...initial, imageAspectRatio: 9 },
        20,
        sourceBlocks,
      ),
    ).toThrow();
  });

  it("rejects a stale source revision before saving", () => {
    const initial = createDefaultArticlePresentation(19, sourceBlocks);
    expect(() =>
      validateArticlePresentation(initial, 20, sourceBlocks),
    ).toThrow(/changed after this presentation draft was opened/iu);
  });
});

describe("article presentation persistence", () => {
  it("keeps saved drafts private and atomically publishes through the approved article state", async () => {
    const miniflare = new Miniflare({
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } };",
      d1Databases: { DB: "14141414-1414-1414-1414-141414141414" },
      cf: false,
    });

    try {
      const database = (await miniflare.getD1Database("DB")) as D1Database;
      for (const migration of [
        "0001_authentication.sql",
        "0006_feeds_pipeline.sql",
        "0007_scraped_article_content.sql",
        "0008_pipeline_article_merges.sql",
        "0009_feed_schedule.sql",
        "0010_pipeline_article_publication.sql",
        "0011_pipeline_article_categories.sql",
        "0014_article_presentations.sql",
      ]) {
        await executeSqlScript(
          database,
          await readFile(
            new URL(`../migrations/${migration}`, import.meta.url),
            "utf8",
          ),
        );
      }

      const originalUpdatedAt = 1_700_000_000;
      await database
        .prepare(
          `INSERT INTO users (
             id, email, full_name, role, status, created_at, updated_at
           ) VALUES ('employee-1', 'editor@example.test', 'Editor', 'employee', 'active', ?, ?)` ,
        )
        .bind(originalUpdatedAt, originalUpdatedAt)
        .run();
      await database
        .prepare(
          `INSERT INTO feeds (
             id, name, url, status, created_at, updated_at, created_by_user_id
           ) VALUES ('feed-1', 'Desk', 'https://example.test/feed', 'active', ?, ?, 'employee-1')`,
        )
        .bind(originalUpdatedAt, originalUpdatedAt)
        .run();
      await database
        .prepare(
          `INSERT INTO pipeline_articles (
             id, feed_id, title, url, status, rewritten_text,
             created_at, updated_at, published_at
           ) VALUES (
             'article-1', 'feed-1', 'Original title', 'https://example.test/article',
             'rewritten', 'Public headline\n\nFirst paragraph.\n\nSecond paragraph.',
             ?, ?, NULL
           )`,
        )
        .bind(originalUpdatedAt, originalUpdatedAt)
        .run();

      const article = await getPipelineArticleById(database, "article-1");
      expect(article).not.toBeNull();
      const blocks = articlePresentationSourceBlocks(article!);
      const initial = createDefaultArticlePresentation(
        article!.updatedAt,
        blocks,
      );
      const edited = replaceArticleText(initial, "title", 0, 6, "Edited");
      const draft = applyArticleTextStyle(edited, "title", 0, 6, {
        fontFamily: "serif",
        fontSize: 40,
        bold: true,
        underline: true,
        fontColor: "#245b88",
      });
      const scaledDraft: ArticlePresentation = {
        ...draft,
        imageScalePercent: 70,
        imageAspectRatio: 1.25,
      };

      await saveArticlePresentationDraft(
        database,
        article!,
        scaledDraft,
        "employee-1",
      );
      const savedState = await getArticlePresentationState(database, article!);
      expect(savedState.draft.imageScalePercent).toBe(70);
      expect(savedState.published.imageScalePercent).toBe(100);
      expect(savedState.hasUnpublishedChanges).toBe(true);
      expect(
        (await getPublishedArticlePresentation(database, article!))
          .imageScalePercent,
      ).toBe(100);

      await publishArticlePresentation(
        database,
        article!,
        scaledDraft,
        "employee-1",
      );
      const publishedArticle = await getPipelineArticleById(
        database,
        "article-1",
      );
      expect(publishedArticle?.status).toBe("approved");
      expect(publishedArticle?.publishedAt).not.toBeNull();
      const publishedState = await getArticlePresentationState(
        database,
        publishedArticle!,
      );
      expect(publishedState.published.imageScalePercent).toBe(70);
      expect(publishedState.published.imageAspectRatio).toBe(1.25);
      expect(articlePresentationBlockText(publishedState.published, "title")).toBe(
        "Edited headline",
      );
      expect(publishedState.hasUnpublishedChanges).toBe(false);
    } finally {
      await miniflare.dispose();
    }
  }, 15_000);
});
