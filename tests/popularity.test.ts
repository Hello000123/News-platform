import { describe, expect, it } from "vitest";

import {
  connectedStoryArticles,
  selectPopularPipelineStories,
  titlesDescribeSameStory,
} from "@/lib/server/feeds/popularity";
import {
  MAX_PIPELINE_RELATED_ARTICLE_IDS,
  type PipelineArticleView,
} from "@/lib/shared/feeds-contracts";

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

  it("does not merge different games that use the same daily hints template", () => {
    const connections = "NYT Connections hints and answers for Sunday, August 9 (game #1155)";
    const quordle = "Quordle hints and answers for Sunday, August 9 (game #1658)";
    const strands = "NYT Strands hints and answers for Sunday, August 9 (game #889)";

    expect(titlesDescribeSameStory(connections, quordle)).toBe(false);
    expect(titlesDescribeSameStory(connections, strands)).toBe(false);
    expect(titlesDescribeSameStory(quordle, strands)).toBe(false);
    expect(
      titlesDescribeSameStory(
        connections,
        "New York Times Connections hints and answers for Sunday, August 9 (game #1155)",
      ),
    ).toBe(true);
    expect(selectPopularPipelineStories([
      article("connections", "techradar", connections),
      article("quordle", "techradar", quordle),
      article("strands", "techradar", strands),
    ])).toHaveLength(3);
  });

  it("keeps contradictory events out of the same story cluster", () => {
    expect(
      titlesDescribeSameStory(
        "Apple launches iPhone 17 worldwide",
        "Apple recalls iPhone 17 worldwide",
      ),
    ).toBe(false);
    expect(titlesDescribeSameStory("香港樓價連升三月", "香港樓價連跌三月")).toBe(false);
    expect(
      titlesDescribeSameStory(
        "Apple launches iPhone update as prices rise",
        "Apple launches iPhone update as prices fall",
      ),
    ).toBe(false);
    expect(
      titlesDescribeSameStory("公司發布手機後售價上升", "公司發布手機後售價下跌"),
    ).toBe(false);
  });

  it("still groups equivalent event wording", () => {
    expect(
      titlesDescribeSameStory(
        "Apple launches iPhone 17 worldwide",
        "Apple unveils iPhone 17 worldwide",
      ),
    ).toBe(true);
    expect(titlesDescribeSameStory("公司公布新款手機", "公司發布新款手機")).toBe(true);
    expect(
      titlesDescribeSameStory(
        "Apple announces iPhone 17 recall worldwide",
        "Apple recalls iPhone 17 worldwide",
      ),
    ).toBe(true);
    expect(titlesDescribeSameStory("公司宣布召回新手機", "公司召回新手機")).toBe(true);
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

  it("prefers a saved full-text report as the canonical article in a mixed cluster", () => {
    const stories = selectPopularPipelineStories([
      article("feed-only", "wire-a", "OpenAI unveils GPT-5 AI model", {
        sourceText: null,
        description: "A very long feed preview. ".repeat(100),
        pubDate: 1_780_000_200,
      }),
      article("saved-source", "wire-b", "OpenAI unveils GPT-5 model for developers", {
        sourceText: "Complete saved report.",
        description: "Short preview.",
        pubDate: 1_780_000_100,
      }),
    ]);

    expect(stories[0]).toMatchObject({
      articleId: "saved-source",
      sourceCount: 2,
      reportCount: 2,
      relatedArticleIds: ["saved-source", "feed-only"],
    });
  });

  it("caps a very large cluster at the rewrite API's related-report limit", () => {
    const reportCount = MAX_PIPELINE_RELATED_ARTICLE_IDS + 5;
    const [story] = selectPopularPipelineStories(
      Array.from({ length: reportCount }, (_, index) =>
        article(`same-${index}`, `wire-${index}`, "Shared exact story headline"),
      ),
    );

    expect(story.reportCount).toBe(reportCount);
    expect(story.relatedArticleIds).toHaveLength(MAX_PIPELINE_RELATED_ARTICLE_IDS);
    expect(story.relatedArticleIds[0]).toBe(story.articleId);
  });
});
