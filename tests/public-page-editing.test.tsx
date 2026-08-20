// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CategoryPageContent,
  categoryPresentationSource,
} from "@/components/news/category-page-content";
import { createDefaultArticlePresentation } from "@/lib/shared/article-presentation";
import type { PipelineArticleView } from "@/lib/shared/feeds-contracts";
import type { NewsCategory } from "@/lib/shared/news-categories";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children?: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function report(
  category: NewsCategory,
  index: number,
): PipelineArticleView {
  return {
    id: `${category}-report-${index}`,
    feedId: "feed-1",
    feedName: "Editorial desk",
    title: `Source report ${index}`,
    url: `https://example.test/report-${index}`,
    description: `Summary for report ${index}.`,
    author: "Reporter",
    pubDate: 1_780_000_000 - index,
    status: "approved",
    rewrittenText: `Published report ${index}\n\nBody for report ${index}.`,
    imageUrl: `https://images.example.test/report-${index}.webp`,
    category,
    publishedAt: 1_780_000_000 - index,
    createdAt: 1_780_000_000 - index,
    updatedAt: 1_780_000_000 - index,
  };
}

describe("public category presentation editing", () => {
  afterEach(cleanup);

  it("keeps presentation image identifiers stable when a report is updated", () => {
    const original = report("technology", 1);
    const updated = { ...original, updatedAt: original.updatedAt + 60 };
    const originalSource = categoryPresentationSource([original], "technology");
    const updatedSource = categoryPresentationSource([updated], "technology");

    expect(updatedSource.sourceImageIds).toEqual(originalSource.sourceImageIds);
    expect(updatedSource.sourceBlocks.map(({ id }) => id)).not.toEqual(
      originalSource.sourceBlocks.map(({ id }) => id),
    );
  });

  it.each(["technology", "social-enterprise"] as const)(
    "edits every report on the %s archive without making fixed categories editable",
    (category) => {
      const articles = [report(category, 1), report(category, 2)];
      const source = categoryPresentationSource(articles, category);
      const presentation = createDefaultArticlePresentation(
        source.sourceUpdatedAt,
        source.sourceBlocks,
        source.sourceImageIds,
      );

      render(
        <CategoryPageContent
          articles={articles}
          category={category}
          presentationDraft={presentation}
          publishedPresentation={presentation}
          canEditPresentation
          editPresentation
        />,
      );

      expect(screen.getByRole("toolbar", { name: "Home text formatting ribbon" })).toBeTruthy();
      expect(screen.getAllByRole("textbox", { name: /Editable/u })).toHaveLength(5);
      expect(
        screen.getAllByRole("button", {
          name: /Double-click to show the resize handle/u,
        }),
      ).toHaveLength(2);
      expect(screen.queryByRole("link", { name: "Published report 2" })).toBeNull();
      expect(screen.getByRole("link", { name: "Exit editing" }).getAttribute("href")).toBe(
        `/${category}`,
      );
      expect(screen.getByRole("heading", { level: 1 }).querySelector("[contenteditable]")).toBeNull();
    },
  );

  it("offers the employee edit entry and omits the redundant News Index row", () => {
    render(
      <CategoryPageContent
        articles={[report("technology", 1)]}
        category="technology"
        canEditPresentation
      />,
    );

    expect(screen.getByRole("link", { name: "Edit page" }).getAttribute("href")).toBe(
      "/technology?edit=1",
    );
    expect(screen.queryByText(/News Index/iu)).toBeNull();
  });

  it("keeps an empty Social Enterprise archive editable without unlocking its category title", () => {
    render(
      <CategoryPageContent
        articles={[]}
        category="social-enterprise"
        canEditPresentation
        editPresentation
      />,
    );

    expect(screen.getByRole("toolbar", { name: "Home text formatting ribbon" })).toBeTruthy();
    expect(screen.getAllByRole("textbox", { name: /Editable/u })).toHaveLength(3);
    expect(screen.getByRole("heading", { level: 1 }).querySelector("[contenteditable]")).toBeNull();
  });
});
