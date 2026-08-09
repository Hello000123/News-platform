import { describe, expect, it } from "vitest";

import {
  MAX_PIPELINE_RELATED_ARTICLE_IDS,
  feedInputSchema,
  feedUpdateSchema,
  pipelineArticlePostUpdateSchema,
  pipelineRewriteInputSchema,
  pipelineStatusUpdateSchema,
  popularPipelineStorySchema,
  scrapedArticleImportRequestSchema,
} from "@/lib/shared/feeds-contracts";

describe("feeds contracts", () => {
  it("accepts a valid feed input and normalises the URL", () => {
    const input = feedInputSchema.parse({
      name: "  World   News ",
      url: "https://feeds.example/world.xml#fragment",
    });
    expect(input.name).toBe("World News");
    expect(input.url).toBe("https://feeds.example/world.xml");
  });

  it("rejects invalid feed URLs", () => {
    expect(() =>
      feedInputSchema.parse({ name: "Bad", url: "not-a-url" }),
    ).toThrow();
  });

  it("rejects feeds with a control-character name", () => {
    expect(() =>
      feedInputSchema.parse({ name: "Bad\u0007name", url: "https://example.com/x" }),
    ).toThrow();
  });

  it("requires status for feed updates", () => {
    expect(() =>
      feedUpdateSchema.parse({
        name: "World News",
        url: "https://feeds.example/world.xml",
      }),
    ).toThrow();
    expect(
      feedUpdateSchema.parse({
        name: "World News",
        url: "https://feeds.example/world.xml",
        status: "paused",
      }).status,
    ).toBe("paused");
  });

  it("defaults pipeline rewrite instruction and accepts multi-source Chinese options", () => {
    const input = pipelineRewriteInputSchema.parse({
      lengthOption: "concise",
      outputLanguage: "traditional_chinese",
      relatedArticleIds: ["article-a", "article-b"],
    });
    expect(input.instruction).toBe("");
    expect(input.lengthOption).toBe("concise");
    expect(input.outputLanguage).toBe("traditional_chinese");
    expect(input.relatedArticleIds).toEqual(["article-a", "article-b"]);
    expect(pipelineRewriteInputSchema.parse({}).relatedArticleIds).toEqual([]);
    expect(pipelineRewriteInputSchema.parse({}).publish).toBe(false);
    expect(pipelineRewriteInputSchema.parse({ publish: true }).publish).toBe(true);
    expect(
      pipelineRewriteInputSchema.parse({ debugBatchId: "top5-20260809.batch_1" })
        .debugBatchId,
    ).toBe("top5-20260809.batch_1");
    expect(() => pipelineRewriteInputSchema.parse({ debugBatchId: "invalid batch id" })).toThrow();
  });

  it("uses one consistent related-report limit for requests and responses", () => {
    const ids = Array.from(
      { length: MAX_PIPELINE_RELATED_ARTICLE_IDS },
      (_, index) => `article-${index}`,
    );
    expect(pipelineRewriteInputSchema.parse({ relatedArticleIds: ids }).relatedArticleIds).toEqual(
      ids,
    );
    const story = {
      articleId: ids[0],
      title: "Popular story",
      sourceCount: 2,
      reportCount: ids.length,
      publishedAt: 1_780_000_000,
      relatedArticleIds: ids,
    };
    expect(popularPipelineStorySchema.parse(story).relatedArticleIds).toEqual(ids);
    expect(() =>
      pipelineRewriteInputSchema.parse({ relatedArticleIds: [...ids, "one-too-many"] }),
    ).toThrow();
    expect(() =>
      popularPipelineStorySchema.parse({
        ...story,
        relatedArticleIds: [...ids, "one-too-many"],
      }),
    ).toThrow();
  });

  it("validates pipeline status transitions", () => {
    expect(pipelineStatusUpdateSchema.parse({ status: "approved" }).status).toBe(
      "approved",
    );
    expect(() =>
      pipelineStatusUpdateSchema.parse({ status: "rewritten" }),
    ).toThrow();
  });

  it("validates editable post copy and public featured-image URLs", () => {
    expect(
      pipelineArticlePostUpdateSchema.parse({
        rewrittenText: "  Homepage headline\n\nHomepage copy.  ",
        imageUrl: "https://images.example.com/story.webp",
        category: "technology",
        status: "approved",
      }),
    ).toEqual({
      rewrittenText: "Homepage headline\n\nHomepage copy.",
      imageUrl: "https://images.example.com/story.webp",
      category: "technology",
      status: "approved",
    });
    expect(pipelineArticlePostUpdateSchema.parse({ imageUrl: "" }).imageUrl).toBeNull();
    expect(
      pipelineArticlePostUpdateSchema.parse({
        imageUrl: "/api/news-images/8f0ec19394554203a99a9ab6c1216aa2?v=1786123456",
      }).imageUrl,
    ).toBe("/api/news-images/8f0ec19394554203a99a9ab6c1216aa2?v=1786123456");
    expect(
      pipelineArticlePostUpdateSchema.parse({ category: "social-enterprise" }).category,
    ).toBe("social-enterprise");
    expect(() => pipelineArticlePostUpdateSchema.parse({})).toThrow();
    expect(() =>
      pipelineArticlePostUpdateSchema.parse({ imageUrl: "javascript:alert(1)" }),
    ).toThrow();
    expect(() =>
      pipelineArticlePostUpdateSchema.parse({
        imageUrl: "https://user:password@images.example.com/story.webp",
      }),
    ).toThrow();
    expect(() =>
      pipelineArticlePostUpdateSchema.parse({ category: "general" }),
    ).toThrow();
  });

  it("accepts saved content in the copied scraper export format", () => {
    const input = scrapedArticleImportRequestSchema.parse({
      articles: [
        {
          source: "unwire",
          title: "A saved article",
          url: "https://unwire.example/news/saved-article",
          author: "News Desk",
          publishedAt: "2026-08-03T06:00:00Z",
          contentText: "The text saved by the scraper.",
          imageUrl: "https://unwire.example/images/article.jpg",
        },
      ],
    });
    expect(input.articles[0]?.contentText).toBe("The text saved by the scraper.");
  });
});
