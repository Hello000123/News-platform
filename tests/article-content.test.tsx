// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  articleBodyParagraphs,
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
  it("removes only an opening paragraph that repeats the article title", () => {
    const repeatedTitle = article(1);
    expect(articleBodyParagraphs(repeatedTitle)).toEqual([
      "Opening paragraph 1 provides the key context.",
      "Second paragraph 1 develops the report.",
      "Third paragraph 1 closes the report.",
    ]);

    const distinctOpening = article(2, {
      rewrittenText: "An important opening sentence.\n\nThe second valid paragraph follows.",
    });
    expect(articleBodyParagraphs(distinctOpening)).toEqual([
      "An important opening sentence.",
      "The second valid paragraph follows.",
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

  it("keeps deterministic grayscale image URLs", () => {
    expect(placeholderImageUrl("article/one", 1200, 675)).toBe(
      "https://picsum.photos/seed/pressready-article%2Fone/1200/675.webp?grayscale",
    );
  });
});

describe("NewsArticlePageContent", () => {
  afterEach(cleanup);

  it("renders article metadata, body, public source, hero, and accessible related links", () => {
    const current = article(1, { description: "A useful editorial deck." });
    const related = article(2);
    render(<NewsArticlePageContent article={current} related={[related]} />);

    expect(screen.getByRole("heading", { level: 1, name: current.title })).toBeTruthy();
    expect(screen.getByText("A useful editorial deck.")).toBeTruthy();
    expect(document.querySelector(".news-v1-article-lede")?.textContent).toBe(
      "Opening paragraph 1 provides the key context.",
    );
    expect(document.querySelector(".news-v1-article-reading")?.textContent).toContain(
      "Second paragraph 1 develops the report.",
    );
    expect(screen.getByRole("link", { name: /source\.example\.com/u }).getAttribute("href")).toBe(current.url);
    expect(screen.getByRole("img", { name: `${current.title} 的新聞示意圖片` }).getAttribute("src")).toBe(
      placeholderImageUrl(current.id, 1200, 675),
    );
    expect(
      screen.getAllByRole("link", { name: /所有已核准報道/u }).every((link) => link.getAttribute("href") === "/"),
    ).toBe(true);
    expect(screen.getByRole("link", { name: related.title }).getAttribute("href")).toBe("/news/article-2");
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
