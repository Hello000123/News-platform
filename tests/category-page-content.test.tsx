// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CategoryPageContent } from "@/components/news/category-page-content";
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
    "aria-label"?: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function article(overrides: Partial<PipelineArticleView> = {}): PipelineArticleView {
  return {
    id: "technology-report-1",
    feedId: "feed-1",
    feedName: "科技編輯室",
    title: "Original source title",
    url: "https://example.com/report",
    description: "這是一段已核准報道的摘要，讓讀者快速理解新聞重點。",
    author: "陳記者",
    pubDate: 1_780_000_000,
    status: "approved",
    rewrittenText: "編輯改寫後的科技新聞標題\n\n報道正文第一段。",
    imageUrl: "https://images.example.com/report.webp",
    category: "technology",
    publishedAt: 1_780_100_000,
    createdAt: 1_780_000_000,
    updatedAt: 1_780_100_000,
    ...overrides,
  };
}

describe("CategoryPageContent", () => {
  afterEach(cleanup);

  it("renders the category archive with public headlines, images and metadata", () => {
    render(<CategoryPageContent articles={[article()]} category="technology" />);

    expect(screen.getByRole("heading", { level: 1, name: "科技" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "全部科技報道" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "編輯改寫後的科技新聞標題" })).toBeTruthy();
    expect(screen.getByText("這是一段已核准報道的摘要，讓讀者快速理解新聞重點。")).toBeTruthy();
    expect(screen.getByText("撰文・陳記者")).toBeTruthy();

    const headline = screen.getByRole("link", { name: "編輯改寫後的科技新聞標題" });
    expect(headline.getAttribute("href")).toBe("/news/technology-report-1");
    expect(screen.getByRole("img", { name: "編輯改寫後的科技新聞標題 的新聞圖片" }).getAttribute("src")).toBe(
      "https://images.example.com/report.webp",
    );
    expect(screen.getByRole("link", { name: "閱讀：編輯改寫後的科技新聞標題" }).getAttribute("href")).toBe(
      "/news/technology-report-1",
    );
  }, 15_000);

  it("shows an honest missing-image treatment without a fabricated image", () => {
    render(
      <CategoryPageContent
        articles={[article({ author: null, imageUrl: null })]}
        category="technology"
      />,
    );

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("圖片待更新")).toBeTruthy();
    expect(screen.queryByText(/撰文/u)).toBeNull();
  });

  it("renders useful empty and service-unavailable states", () => {
    const { rerender } = render(<CategoryPageContent articles={[]} category="social-enterprise" />);

    expect(screen.getByRole("heading", { level: 1, name: "社企專欄" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("首批社企專欄報道正在準備中");
    expect(screen.getByRole("link", { name: /返回首頁/u }).getAttribute("href")).toBe("/");

    rerender(<CategoryPageContent articles={[]} category="social-enterprise" loadFailed />);
    expect(screen.getByRole("status").textContent).toContain("暫時未能載入報道");
  });
});
