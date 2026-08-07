import { describe, expect, it } from "vitest";

import {
  connectedStoryArticles,
  selectPopularPipelineStories,
  titlesDescribeSameStory,
} from "@/lib/server/feeds/popularity";
import type { PipelineArticleView } from "@/lib/shared/feeds-contracts";

function article(
  id: string,
  feedId: string,
  title: string,
  overrides: Partial<PipelineArticleView> = {},
): PipelineArticleView {
  return {
    id,
    feedId,
    feedName: feedId,
    title,
    url: `https://example.test/${id}`,
    description: "Saved report summary.",
    author: null,
    pubDate: 1_780_000_000,
    status: "new",
    rewrittenText: null,
    sourceText: "Saved report source text.",
    imageUrl: null,
    createdAt: 1_780_000_000,
    updatedAt: 1_780_000_000,
    ...overrides,
  };
}

describe("pipeline story popularity", () => {
  it("groups related coverage once and ranks by independent source coverage", () => {
    const stories = selectPopularPipelineStories([
      article("gpt-b", "wire-b", "OpenAI unveils GPT-5 model for developers", {
        sourceText: "B".repeat(200),
        pubDate: 1_780_000_200,
      }),
      article("gpt-c", "wire-c", "OpenAI launches GPT-5 AI platform", {
        sourceText: "C".repeat(300),
        pubDate: 1_780_000_300,
      }),
      article("gpt-a", "wire-a", "OpenAI unveils GPT-5 AI model", {
        sourceText: "A".repeat(600),
        pubDate: 1_780_000_100,
      }),
      article("market-a", "wire-d", "Hong Kong market closes higher after bank rally", {
        pubDate: 1_780_000_900,
      }),
      article("market-b", "wire-e", "Hong Kong market closes higher as bank shares rally", {
        pubDate: 1_780_001_000,
      }),
      article("single", "wire-f", "Typhoon warning issued for the weekend", {
        pubDate: 1_780_002_000,
      }),
    ]);

    expect(stories).toHaveLength(3);
    expect(stories[0]).toMatchObject({
      articleId: "gpt-a",
      sourceCount: 3,
      reportCount: 3,
      relatedArticleIds: ["gpt-a", "gpt-c", "gpt-b"],
    });
    expect(stories[1]).toMatchObject({ sourceCount: 2, reportCount: 2 });
    expect(stories[2]).toMatchObject({ articleId: "single", sourceCount: 1 });
    expect(new Set(stories.flatMap((story) => story.relatedArticleIds)).size).toBe(6);
  });

  it("does not merge reports that merely share a broad topic", () => {
    expect(
      titlesDescribeSameStory(
        "Apple launches new AI assistant for iPhone",
        "Apple reports quarterly earnings as iPhone sales rise",
      ),
    ).toBe(false);
    expect(titlesDescribeSameStory("香港推出新創科基金", "香港推出新創科基金")).toBe(true);
  });

  it("keeps only the transitive component connected to the canonical story", () => {
    const canonical = article("a", "wire-a", "Alpha Beta launch");
    const bridge = article("b", "wire-b", "Alpha Beta Gamma");
    const transitive = article("c", "wire-c", "Beta Gamma Delta");
    const unrelated = article("d", "wire-d", "Hong Kong market closes higher");

    expect(connectedStoryArticles(canonical, [bridge, transitive, unrelated])).toEqual([
      bridge,
      transitive,
    ]);
  });
});
