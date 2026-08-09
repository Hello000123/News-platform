import { describe, expect, it, vi } from "vitest";

import { loadPipelineArticleSource } from "@/lib/server/feeds/scraper";
import type { SourceSnapshot } from "@/lib/shared/contracts";

const article = {
  title: "Saved headline",
  url: "https://publisher.example/story",
  description: "RSS preview text.",
  sourceText: "Captured full article text.",
};

function liveSnapshot(primaryText: string): SourceSnapshot {
  return {
    primaryText,
    userDraft: "",
    sourceUrl: article.url,
    linkedTitle: article.title,
    imageContext: [],
  };
}

describe("pipeline article source loading", () => {
  it("uses captured scraper text without making a live request", async () => {
    const liveLoader = vi.fn(async () => liveSnapshot("Live text."));

    await expect(loadPipelineArticleSource(article, liveLoader)).resolves.toMatchObject({
      primaryText: "Captured full article text.",
      linkedTitle: "Saved headline",
    });
    expect(liveLoader).not.toHaveBeenCalled();
  });

  it("uses the live article for feed-only records", async () => {
    const liveLoader = vi.fn(async () => liveSnapshot("Live article text."));

    await expect(
      loadPipelineArticleSource({ ...article, sourceText: null }, liveLoader),
    ).resolves.toMatchObject({ primaryText: "Live article text." });
    expect(liveLoader).toHaveBeenCalledWith(article.url);
  });

  it("falls back to the RSS preview when the live publisher request fails", async () => {
    const liveLoader = vi.fn(async () => {
      throw new Error("publisher unavailable");
    });

    await expect(
      loadPipelineArticleSource({ ...article, sourceText: null }, liveLoader),
    ).resolves.toMatchObject({
      primaryText: "RSS preview text.",
      linkedTitle: "Saved headline",
    });
  });

  it("preserves the live-fetch error when no saved preview is available", async () => {
    const failure = new Error("publisher unavailable");
    const liveLoader = vi.fn(async () => {
      throw failure;
    });

    await expect(
      loadPipelineArticleSource(
        { ...article, sourceText: null, description: null },
        liveLoader,
      ),
    ).rejects.toBe(failure);
  });
});
