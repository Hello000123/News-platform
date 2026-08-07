// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PipelineWorkspace } from "@/components/pipeline/pipeline-workspace";
import {
  getPipelineArticleContent,
  listPipelineArticles,
  listPopularPipelineStories,
  rewritePipelineArticle,
  uploadPipelineArticleImage,
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
  removePipelineArticleImage: vi.fn(),
  rewritePipelineArticle: vi.fn(),
  uploadPipelineArticleImage: vi.fn(),
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
  category: "technology",
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
  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:editor-photo-preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

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
        category: input.category === undefined ? article.category : input.category,
        status: input.status ?? article.status,
        publishedAt: input.status === "approved" ? 1_780_000_200 : null,
      },
    }));
    const user = userEvent.setup();
    render(<PipelineWorkspace initialModel="grok-4.5" />);

    const headline = await screen.findByDisplayValue("Editorial headline", {}, { timeout: 15_000 });
    const copy = screen.getByDisplayValue("Editable article copy.");
    await user.click(screen.getByText("Or use a public image URL"));
    const image = screen.getByLabelText("Featured image URL");
    const category = screen.getByLabelText("Public category");
    await user.clear(headline);
    await user.type(headline, "Updated public headline");
    await user.clear(copy);
    await user.type(copy, "Updated public copy.");
    await user.clear(image);
    await user.type(image, "https://images.example.com/updated.webp");
    await user.selectOptions(category, "social-enterprise");
    await user.click(screen.getByRole("button", { name: "Publish to homepage" }));

    await waitFor(() =>
      expect(updatePipelineArticlePost).toHaveBeenCalledWith("article-1", {
        rewrittenText: "Updated public headline\n\nUpdated public copy.",
        imageUrl: "https://images.example.com/updated.webp",
        category: "social-enterprise",
        status: "approved",
      }),
    );
    expect(await screen.findByText(/was published to the homepage/u)).toBeTruthy();
  }, 20_000);

  it("supports rewriting and publishing in one action", async () => {
    const newArticle = { ...article, status: "new" as const, rewrittenText: null, imageUrl: null, category: null };
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

    await waitFor(
      () =>
        expect(
          screen.getByRole("button", { name: "Rewrite & publish" }).hasAttribute("disabled"),
        ).toBe(false),
      { timeout: 15_000 },
    );
    await user.click(screen.getByText("Or use a public image URL"));
    const image = screen.getByLabelText("Featured image URL");
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
  }, 20_000);

  it("requests a detailed full-source article for each Top 5 story", async () => {
    const newArticle = {
      ...article,
      status: "new" as const,
      rewrittenText: null,
    };
    mockArticleLoad(newArticle);
    vi.mocked(listPopularPipelineStories).mockResolvedValue({
      stories: [
        {
          articleId: newArticle.id,
          title: newArticle.title,
          sourceCount: 1,
          reportCount: 1,
          publishedAt: newArticle.pubDate,
          relatedArticleIds: [newArticle.id],
        },
      ],
    });
    vi.mocked(rewritePipelineArticle).mockResolvedValue({
      article: {
        ...newArticle,
        status: "rewritten",
        rewrittenText: "完整新聞標題\n\n完整新聞正文。",
      },
      finalText: "完整新聞標題\n\n完整新聞正文。",
      validation: { status: "passed", attempts: 1 },
    });
    const user = userEvent.setup();
    render(<PipelineWorkspace initialModel="grok-4.5" />);

    await screen.findByRole("heading", { level: 2, name: newArticle.title }, { timeout: 15_000 });
    await user.click(screen.getByRole("button", { name: "Rewrite top 5 in Chinese" }));

    await waitFor(() =>
      expect(rewritePipelineArticle).toHaveBeenCalledWith(
        newArticle.id,
        expect.objectContaining({
          model: "grok-4.5",
          outputLanguage: "traditional_chinese",
          lengthOption: "more_detailed",
          relatedArticleIds: [newArticle.id],
          instruction: expect.stringContaining("完整新聞報道"),
        }),
      ),
    );
  }, 20_000);

  it("uploads an editor-owned photo and keeps the managed image with the post", async () => {
    mockArticleLoad(article);
    const managedImageUrl = `/api/news-images/${"a".repeat(32)}?v=2`;
    vi.mocked(uploadPipelineArticleImage).mockResolvedValue({
      article: { ...article, imageUrl: managedImageUrl },
      imageUrl: managedImageUrl,
    });
    const user = userEvent.setup();
    render(<PipelineWorkspace initialModel="grok-4.5" />);

    await screen.findByDisplayValue("Editorial headline", {}, { timeout: 15_000 });
    const imageInput = screen.getByLabelText("Upload your own photo");
    const file = new File(["valid image bytes"], "community-team.webp", {
      type: "image/webp",
    });
    await user.upload(imageInput, file);

    await waitFor(() =>
      expect(uploadPipelineArticleImage).toHaveBeenCalledWith("article-1", file),
    );
    expect(await screen.findByText(/is uploaded and saved/u)).toBeTruthy();
    expect(screen.getByRole("img", { name: "Featured image preview" }).getAttribute("src")).toBe(
      managedImageUrl,
    );
  }, 20_000);
});
