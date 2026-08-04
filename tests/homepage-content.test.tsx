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
    rewrittenText: `Story ${index} headline\n\nThe first body paragraph for story ${index} includes the key context.\n\nA second body paragraph adds another verified detail.\n\nA third body paragraph provides the closing note.`,
    createdAt: 1_780_000_000 - index,
    updatedAt: 1_780_000_000 - index,
    ...overrides,
  };
}

describe("PressReady homepage view model", () => {
  afterEach(cleanup);

  it("assigns the 15 article slots in order without duplicates", () => {
    const view = buildHomepageView([
      article(0),
      article(0, { title: "Duplicate should be ignored" }),
      ...Array.from({ length: 17 }, (_, index) => article(index + 1)),
    ]);
    const ids = [
      view.lead?.article.id,
      ...view.related.map(({ article: item }) => item.id),
      ...view.featureColumns.flat().map(({ article: item }) => item.id),
      ...view.latest.map(({ article: item }) => item.id),
    ].filter((id): id is string => Boolean(id));

    expect(ids).toHaveLength(15);
    expect(new Set(ids).size).toBe(15);
    expect(view.lead?.article.id).toBe("article-0");
    expect(view.related.map(({ article: item }) => item.id)).toEqual([
      "article-1",
      "article-2",
    ]);
    expect(view.featureColumns).toHaveLength(2);
    expect(view.featureColumns.map((column) => column.map(({ article: item }) => item.id))).toEqual([
      ["article-3", "article-4", "article-5"],
      ["article-6", "article-7", "article-8"],
    ]);
    expect(view.latest.map(({ article: item }) => item.id)).toEqual([
      "article-9",
      "article-10",
      "article-11",
      "article-12",
      "article-13",
      "article-14",
    ]);
    expect(view.topics).toEqual(["World Desk", "Culture Desk"]);
  });

  it("omits unavailable slots for partial and empty datasets", () => {
    const partial = buildHomepageView([article(0), article(1), article(2), article(3)]);
    expect(partial.lead?.article.id).toBe("article-0");
    expect(partial.related).toHaveLength(2);
    expect(partial.featureColumns).toHaveLength(1);
    expect(partial.featureColumns[0]).toHaveLength(1);
    expect(partial.latest).toHaveLength(0);

    const empty = buildHomepageView([]);
    expect(empty.lead).toBeNull();
    expect(empty.related).toEqual([]);
    expect(empty.featureColumns).toEqual([]);
    expect(empty.latest).toEqual([]);
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

  it("renders PressReady branding, accessible article links, and the empty state", () => {
    render(<NewsHomepage view={buildHomepageView([])} />);

    expect(screen.getByText("PressReady", { selector: ".news-v1-brand-name" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("暫時沒有已核准報道");
    expect(screen.getByRole("link", { name: "編輯工作區" }).getAttribute("href")).toBe("/review");
    expect(screen.queryByRole("link", { name: /Approved story/u })).toBeNull();
  });

  it("renders live article titles as links in the editorial slots", () => {
    render(<NewsHomepage view={buildHomepageView(Array.from({ length: 10 }, (_, index) => article(index)))} />);

    const storyLinks = screen.getAllByRole("link", { name: /Approved story/u });
    expect(storyLinks.length).toBeGreaterThan(10);
    expect(storyLinks.every((link) => link.getAttribute("href")?.startsWith("/news/article-"))).toBe(true);
  });
});
