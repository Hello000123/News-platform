// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PipelineWorkspace } from "@/components/pipeline/pipeline-workspace";
import {
  getPipelineArticleContent,
  listPipelineArticles,
  rewritePipelineArticle,
  updatePipelineArticlePost,
} from "@/lib/client/feeds-api";
import type { PipelineArticleView } from "@/lib/shared/feeds-contracts";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children?: ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/lib/client/feeds-api", () => ({
  FeedRequestError: class FeedRequestError extends Error {},
  getPipelineArticleContent: vi.fn(),
  importScrapedArticles: vi.fn(),
  listPipelineArticles: vi.fn(),
  listPopularPipelineStories: vi.fn(),
  rewritePipelineArticle: vi.fn(),
  updatePipelineArticlePost: vi.fn(),
}));

const article: PipelineArticleView = {
  id: "article-1",
  feedId: "feed-1",
  feedName: "World Desk",
  title: "Original source headline",
  url: "https://source.example.com/article-1",
  description: "Original source summary.",
  author: "News Desk",
  pubDate: 1_780_000_000,
  status: "rewritten",
  rewrittenText: "Editorial headline\n\nEditable article copy.",
  sourceText: "Saved source reporting.",
  imageUrl: "https://images.example.com/original.webp",
  mergedIntoArticleId: null,
  publishedAt: null,
  createdAt: 1_780_000_000,
  updatedAt: 1_780_000_100,
};

function mockArticleLoad(value: PipelineArticleView) {
  vi.mocked(listPipelineArticles).mockResolvedValue({ articles: [value] });
  vi.mocked(getPipelineArticleContent).mockResolvedValue({
    article: value,
    content: value.sourceText ?? "Saved source reporting.",
  });
}

describe("PipelineWorkspace post composer", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("edits post copy and its featured image before publishing to the homepage", async () => {
    mockArticleLoad(article);
    vi.mocked(updatePipelineArticlePost).mockImplementation(async (_id, input) => ({
      article: {
        ...article,
        rewrittenText: input.rewrittenText ?? article.rewrittenText,
        imageUrl: input.imageUrl === undefined ? article.imageUrl : input.imageUrl || null,
        status: input.status ?? article.status,
        publishedAt: input.status === "approved" ? 1_780_000_200 : null,
      },
    }));
    const user = userEvent.setup();
    render(<PipelineWorkspace initialModel="grok-4.5" />);

    const copy = await screen.findByLabelText("Post copy");
    const image = screen.getByLabelText("Featured image URL");
    await user.clear(copy);
    await user.type(copy, "Updated public headline\n\nUpdated public copy.");
    await user.clear(image);
    await user.type(image, "https://images.example.com/updated.webp");
    await user.click(screen.getByRole("button", { name: "Publish to homepage" }));

    await waitFor(() =>
      expect(updatePipelineArticlePost).toHaveBeenCalledWith("article-1", {
        rewrittenText: "Updated public headline\n\nUpdated public copy.",
        imageUrl: "https://images.example.com/updated.webp",
        status: "approved",
      }),
    );
    expect(await screen.findByText(/was published to the homepage/u)).toBeTruthy();
  });

  it("supports rewriting and publishing in one action", async () => {
    const newArticle = { ...article, status: "new" as const, rewrittenText: null, imageUrl: null };
    mockArticleLoad(newArticle);
    vi.mocked(updatePipelineArticlePost).mockResolvedValue({
      article: { ...newArticle, imageUrl: "https://images.example.com/new.webp" },
    });
    vi.mocked(rewritePipelineArticle).mockResolvedValue({
      article: {
        ...newArticle,
        status: "approved",
        rewrittenText: "Fresh homepage headline\n\nFresh homepage copy.",
        imageUrl: "https://images.example.com/new.webp",
        publishedAt: 1_780_000_200,
      },
      finalText: "Fresh homepage headline\n\nFresh homepage copy.",
      validation: { status: "passed", attempts: 1 },
    });
    const user = userEvent.setup();
    render(<PipelineWorkspace initialModel="grok-4.5" />);

    const image = await screen.findByLabelText("Featured image URL");
    await user.type(image, "https://images.example.com/new.webp");
    await user.click(screen.getByRole("button", { name: "Rewrite & publish" }));

    await waitFor(() =>
      expect(rewritePipelineArticle).toHaveBeenCalledWith("article-1", {
        model: "grok-4.5",
        publish: true,
      }),
    );
    expect(updatePipelineArticlePost).toHaveBeenCalledWith("article-1", {
      imageUrl: "https://images.example.com/new.webp",
    });
    expect(await screen.findByText(/is now live on the homepage/u)).toBeTruthy();
  });
});
