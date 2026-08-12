// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  articleBodyParagraphs,
  articleDisplayTitle,
  extractArticleKeyPoints,
  extractArticleSummary,
  placeholderImageUrl,
  selectRelatedArticles,
} from "@/components/news/article-content";
import { NewsArticlePageContent } from "@/components/news/article-page-content";
import type { PipelineArticleView } from "@/lib/shared/feeds-contracts";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children?: ReactNode; href: string; className?: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

function article(index: number, overrides: Partial<PipelineArticleView> = {}): PipelineArticleView {
  return {
    id: `article-${index}`,
    feedId: index < 3 ? "world" : "culture",
    feedName: index < 3 ? "World Desk" : "Culture Desk",
    title: `Article headline ${index}`,
    url: `https://source.example.com/news/${index}`,
    description: null,
    author: null,
    pubDate: 1_780_000_000 - index,
    status: "approved",
    rewrittenText: `Article headline ${index}\n\nOpening paragraph ${index} provides the key context.\n\nSecond paragraph ${index} develops the report.\n\nThird paragraph ${index} closes the report.`,
    createdAt: 1_780_000_000 - index,
    updatedAt: 1_780_000_000 - index,
    ...overrides,
  };
}

describe("public article content helpers", () => {
  it("uses the rewrite headline and keeps only article body paragraphs", () => {
    const repeatedTitle = article(1);
    expect(articleDisplayTitle(repeatedTitle)).toBe("Article headline 1");
    expect(articleBodyParagraphs(repeatedTitle)).toEqual([
      "Opening paragraph 1 provides the key context.",
      "Second paragraph 1 develops the report.",
      "Third paragraph 1 closes the report.",
    ]);

    const distinctOpening = article(2, {
      rewrittenText: "A new editorial headline\n\nThe first valid paragraph follows.",
    });
    expect(articleDisplayTitle(distinctOpening)).toBe("A new editorial headline");
    expect(articleBodyParagraphs(distinctOpening)).toEqual([
      "The first valid paragraph follows.",
    ]);
  });

  it("uses description for the deck and limits body-derived key points", () => {
    const source = article(1, {
      description: " A concise source-provided deck. ",
      rewrittenText: "Article headline 1\n\nOne.\n\nTwo.\n\nThree.\n\nFour.",
    });
    expect(extractArticleSummary(source)).toBe("A concise source-provided deck.");
    expect(extractArticleKeyPoints(source)).toEqual(["One.", "Two.", "Three."]);
    expect(extractArticleSummary(article(2, { description: null }))).toBe(
      "Opening paragraph 2 provides the key context.",
    );
  });

  it("turns long body paragraphs into compact clause-based key points", () => {
    const source = article(1, {
      rewrittenText:
        "Article headline 1\n\n新介面仿效 Google Lens 的「搜尋」、「翻譯」、「即時」及「創作」切換器，在畫面底部加入工具列，讓用戶可在不同模式之間切換。\n\n「搜尋」模式採用全新的四條波形動畫設計，用戶說話時頂端會顯示轉錄文字，完成查詢後按下一步箭頭即可。",
    });

    expect(extractArticleKeyPoints(source)).toEqual([
      "新介面仿效 Google Lens 的「搜尋」、「翻譯」、「即時」及「創作」切換器",
      "「搜尋」模式採用全新的四條波形動畫設計",
    ]);
  });

  it("ranks same-feed related stories first with no current or duplicate article", () => {
    const current = article(0);
    const ranked = selectRelatedArticles(current, [
      article(4),
      article(1),
      article(0),
      article(1, { title: "Duplicate" }),
      article(2),
      article(5),
    ]);
    expect(ranked.map(({ id }) => id)).toEqual(["article-1", "article-2", "article-4"]);
    expect(new Set(ranked.map(({ id }) => id)).size).toBe(ranked.length);
  });

  it("ranks stories from the same public category before feed affinity", () => {
    const current = article(0, { category: "technology" });
    const ranked = selectRelatedArticles(current, [
      article(1, { category: "social-enterprise" }),
      article(4, { category: "technology" }),
      article(2, { category: "technology" }),
    ]);
    expect(ranked.map(({ id }) => id)).toEqual(["article-4", "article-2", "article-1"]);
  });

  it("keeps deterministic full-colour image URLs", () => {
    expect(placeholderImageUrl("article/one", 1200, 675)).toBe(
      "https://picsum.photos/seed/pressready-article%2Fone/1200/675.webp",
    );
  });
});

describe("NewsArticlePageContent", () => {
  afterEach(cleanup);

  it("renders article metadata, body, public source, hero, and accessible related links", () => {
    const current = article(1, {
      description: "A useful editorial deck.",
      imageUrl: "https://images.example.com/article-1.webp",
      category: "technology",
      rewrittenText:
        "A stronger rewritten headline\n\nOpening paragraph 1 provides the key context.\n\nSecond paragraph 1 develops the report.",
    });
    const related = article(2);
    render(<NewsArticlePageContent article={current} related={[related]} />);

    expect(screen.getByRole("heading", { level: 1, name: "A stronger rewritten headline" })).toBeTruthy();
    expect(screen.getByText("A useful editorial deck.")).toBeTruthy();
    expect(document.querySelector(".news-v1-article-lede")?.textContent).toBe(
      "Opening paragraph 1 provides the key context.",
    );
    expect(document.querySelector(".news-v1-article-reading")?.textContent).toContain(
      "Second paragraph 1 develops the report.",
    );
    expect(screen.getByRole("link", { name: /source\.example\.com/u }).getAttribute("href")).toBe(current.url);
    expect(screen.getByRole("img", { name: "A stronger rewritten headline 的新聞圖片" }).getAttribute("src")).toBe(
      current.imageUrl,
    );
    expect(
      screen.getAllByRole("link", { name: /所有已核准報道/u }).every((link) => link.getAttribute("href") === "/"),
    ).toBe(true);
    expect(screen.getByRole("link", { name: related.title }).getAttribute("href")).toBe("/news/article-2");
    expect(
      screen
        .getAllByRole("link", { name: "科技" })
        .some((link) => link.getAttribute("href") === "/technology"),
    ).toBe(true);
  });

  it("omits unavailable sidebar sections", () => {
    const current = article(1, {
      rewrittenText: "Article headline 1",
      description: null,
    });
    render(<NewsArticlePageContent article={current} related={[]} />);
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.queryByText("報道重點")).toBeNull();
    expect(screen.queryByText("延伸報道")).toBeNull();
  });
});
