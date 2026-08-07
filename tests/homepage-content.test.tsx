// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildHomepageView,
  extractArticleKeyPoints,
  extractArticleSummary,
  NewsHomepage,
  placeholderImageUrl,
} from "@/components/news/homepage-content";
import type { PipelineArticleView } from "@/lib/shared/feeds-contracts";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children?: ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function article(index: number, overrides: Partial<PipelineArticleView> = {}): PipelineArticleView {
  return {
    id: `article-${index}`,
    feedId: `feed-${index % 2}`,
    feedName: index % 2 === 0 ? "World Desk" : "Culture Desk",
    title: `Approved story ${index}`,
    url: `https://example.com/story-${index}`,
    description: `Description for story ${index}`,
    author: "PressReady Desk",
    pubDate: 1_780_000_000 - index,
    status: "approved",
    category: index % 2 === 0 ? "technology" : "social-enterprise",
    rewrittenText: `Story ${index} headline\n\nThe first body paragraph for story ${index} includes the key context.\n\nA second body paragraph adds another verified detail.\n\nA third body paragraph provides the closing note.`,
    createdAt: 1_780_000_000 - index,
    updatedAt: 1_780_000_000 - index,
    ...overrides,
  };
}

describe("PressReady homepage view model", () => {
  afterEach(cleanup);

  it("keeps every approved article in the chronological stream without duplicates", () => {
    const view = buildHomepageView([
      article(0),
      article(0, { title: "Duplicate should be ignored" }),
      ...Array.from({ length: 17 }, (_, index) => article(index + 1)),
    ]);
    const ids = view.latest.map(({ article: item }) => item.id);

    expect(ids).toHaveLength(18);
    expect(new Set(ids).size).toBe(18);
    expect(view.lead?.article.id).toBe("article-0");
    expect(view.related.map(({ article: item }) => item.id)).toEqual([
      "article-1",
      "article-2",
    ]);
    expect(view.categoryShelves).toHaveLength(2);
    expect(view.categoryShelves.map((shelf) => shelf.articles.map(({ article: item }) => item.id))).toEqual([
      ["article-0", "article-2", "article-4"],
      ["article-1", "article-3", "article-5"],
    ]);
    expect(view.topics).toEqual(["World Desk", "Culture Desk"]);
  });

  it("uses categorized prototype stories only to keep sparse homepage modules present", () => {
    const partial = buildHomepageView([article(0), article(1), article(2), article(3)]);
    expect(partial.lead?.article.id).toBe("article-0");
    expect(partial.related).toHaveLength(2);
    expect(partial.categoryShelves).toHaveLength(2);
    expect(partial.categoryShelves.every((shelf) => shelf.articles.length === 3)).toBe(true);
    expect(partial.latest).toHaveLength(4);
    expect(partial.categoryShelves.some((shelf) => shelf.articles.some((item) => item.isPrototype))).toBe(true);

    const empty = buildHomepageView([]);
    expect(empty.lead?.article.id).toBe("prototype-community-tech");
    expect(empty.related).toHaveLength(2);
    expect(empty.categoryShelves).toHaveLength(2);
    expect(empty.categoryShelves.every((shelf) => shelf.articles.length === 3)).toBe(true);
    expect(empty.categoryShelves.map(({ category }) => category.value)).toEqual([
      "technology",
      "social-enterprise",
    ]);
    expect(empty.latest).toHaveLength(15);
    expect(empty.topics).toEqual(["生成式 AI", "數碼共融", "社區創新", "影響力營運"]);
  });

  it("prefers descriptions, falls back to body text, and extracts only body points", () => {
    const withDescription = article(1, {
      description: "  A concise editorial deck.  ",
      title: "Headline",
      rewrittenText: "Headline\n\nBody paragraph one.\n\nBody paragraph two.",
    });
    expect(extractArticleSummary(withDescription)).toBe("A concise editorial deck.");
    expect(extractArticleKeyPoints(withDescription)).toEqual([
      "Body paragraph one.",
      "Body paragraph two.",
    ]);

    const withoutDescription = article(2, {
      description: null,
      title: "Headline",
      rewrittenText: "Headline\n\nFallback body paragraph.",
    });
    expect(extractArticleSummary(withoutDescription)).toBe("Fallback body paragraph.");

    const withoutBody = article(3, { description: null, rewrittenText: null });
    expect(extractArticleSummary(withoutBody)).toBeNull();
    expect(extractArticleKeyPoints(withoutBody)).toEqual([]);
  });

  it("creates stable grayscale placeholder URLs from article IDs", () => {
    const first = placeholderImageUrl("article/one", 1200, 800);
    expect(first).toBe("https://picsum.photos/seed/pressready-article%2Fone/1200/800.webp?grayscale");
    expect(placeholderImageUrl("article/one", 1200, 800)).toBe(first);
    expect(placeholderImageUrl("article/two", 1200, 800)).not.toBe(first);
  });
});

describe("NewsHomepage rendering", () => {
  afterEach(cleanup);

  it("renders PressReady branding and the complete prototype homepage when there are no live articles", () => {
    const { container } = render(<NewsHomepage view={buildHomepageView([])} />);

    expect(screen.getByText("PressReady", { selector: ".news-v1-brand-name" })).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "當公共 AI 走進社區，誰來定義真正需要解決的問題？",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "科技" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "社企專欄" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "最新短訊" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "科技" }).some((link) => link.getAttribute("href") === "/technology")).toBe(true);
    expect(screen.getAllByRole("link", { name: "社企專欄" }).some((link) => link.getAttribute("href") === "/social-enterprise")).toBe(true);
    expect(screen.getAllByRole("link", { name: "編輯工作區" }).every((link) => link.getAttribute("href") === "/review")).toBe(true);
    expect(container.querySelector("details.news-v1-mobile-menu")).toBeTruthy();
    expect(screen.getByText("目錄", { selector: "summary > span:first-child" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("link", { name: "當公共 AI 走進社區，誰來定義真正需要解決的問題？" })).toBeNull();
  });

  it("renders rewritten headlines and saved images in the live editorial slots", () => {
    render(
      <NewsHomepage
        view={buildHomepageView(
          Array.from({ length: 10 }, (_, index) =>
            article(index, index === 0 ? { imageUrl: "https://images.example.com/lead.webp" } : {}),
          ),
        )}
      />,
    );

    const storyLinks = screen.getAllByRole("link", { name: /Story \d+ headline/u });
    expect(storyLinks.length).toBeGreaterThan(10);
    expect(storyLinks.every((link) => link.getAttribute("href")?.startsWith("/news/article-"))).toBe(true);
    expect(screen.getByRole("img", { name: "Story 0 headline 的封面新聞示意圖片" }).getAttribute("src")).toBe(
      "https://images.example.com/lead.webp",
    );
  });
});
