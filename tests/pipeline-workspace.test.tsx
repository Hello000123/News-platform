// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PipelineWorkspace } from "@/components/pipeline/pipeline-workspace";
import {
  FeedRequestError,
  getPipelineArticleContent,
  importScrapedArticles,
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
  FeedRequestError: class FeedRequestError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly fieldErrors?: Record<string, string[]>,
      public readonly status?: number,
      public readonly debugId?: string,
      public readonly retryable?: boolean,
    ) {
      super(message);
      this.name = "FeedRequestError";
    }
  },
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
    sourceOrigin: "saved_scraper",
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

  it("labels an RSS fallback as incomplete instead of full saved content", async () => {
    mockArticleLoad(article);
    vi.mocked(getPipelineArticleContent).mockResolvedValue({
      article,
      content: "Original source summary.",
      sourceOrigin: "rss_preview",
    });

    render(<PipelineWorkspace initialModel="grok-4.5" />);

    expect(
      await screen.findByText("Read RSS preview (incomplete)", {}, { timeout: 15_000 }),
    ).toBeTruthy();
    expect(
      screen.getByText(/publisher page could not provide a complete body/u),
    ).toBeTruthy();
  }, 20_000);

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
          sourceCount: 5,
          reportCount: 5,
          publishedAt: newArticle.pubDate,
          relatedArticleIds: [newArticle.id, "related-article-1"],
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
          relatedArticleIds: [newArticle.id, "related-article-1"],
          instruction: expect.stringContaining("完整新聞報道"),
        }),
      ),
    );
    expect(await screen.findByText(/combined 1 duplicate report/u)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open rewrite debug log/u }).getAttribute("href"))
      .toBe("/api/pipeline/rewrite-debug?limit=50");
    expect(rewritePipelineArticle).toHaveBeenCalledWith(
      newArticle.id,
      expect.objectContaining({ debugBatchId: expect.any(String) }),
    );
  }, 20_000);

  it("makes partial Top 5 failures explicit in the success notice", async () => {
    const newArticle = {
      ...article,
      status: "new" as const,
      rewrittenText: null,
    };
    mockArticleLoad(newArticle);
    vi.mocked(listPopularPipelineStories).mockResolvedValue({
      stories: [
        {
          articleId: "successful-story",
          title: "Successful story",
          sourceCount: 2,
          reportCount: 2,
          publishedAt: newArticle.pubDate,
          relatedArticleIds: ["successful-story", "successful-related"],
        },
        {
          articleId: "failed-story",
          title: "Failed story",
          sourceCount: 1,
          reportCount: 1,
          publishedAt: newArticle.pubDate,
          relatedArticleIds: ["failed-story"],
        },
      ],
    });
    vi.mocked(rewritePipelineArticle)
      .mockResolvedValueOnce({
        article: {
          ...newArticle,
          id: "successful-story",
          status: "rewritten",
          rewrittenText: "完整新聞標題\n\n完整新聞正文。",
        },
        finalText: "完整新聞標題\n\n完整新聞正文。",
        validation: { status: "passed", attempts: 1 },
      })
      .mockRejectedValueOnce(
        new FeedRequestError(
          "REWRITE_LANGUAGE_MISMATCH",
          "Traditional Chinese validation failed.",
          undefined,
          422,
          "debug-failure-1",
          false,
        ),
      );
    const user = userEvent.setup();
    render(<PipelineWorkspace initialModel="grok-4.5" />);

    await screen.findByRole("heading", { level: 2, name: newArticle.title }, { timeout: 15_000 });
    await user.click(screen.getByRole("button", { name: "Rewrite top 5 in Chinese" }));

    expect(await screen.findByText(/1 group failed; see the error below/u)).toBeTruthy();
    expect(
      screen.getByText(/Could not rewrite 1 story group: Failed story.*debug-failure-1/u),
    ).toBeTruthy();
  }, 20_000);

  it("retries a retryable Top 5 story once and completes the batch", async () => {
    const newArticle = {
      ...article,
      status: "new" as const,
      rewrittenText: null,
    };
    mockArticleLoad(newArticle);
    vi.mocked(listPopularPipelineStories).mockResolvedValue({
      stories: [
        {
          articleId: "retry-story",
          title: "Retry story",
          sourceCount: 1,
          reportCount: 1,
          publishedAt: newArticle.pubDate,
          relatedArticleIds: ["retry-story"],
        },
      ],
    });
    vi.mocked(rewritePipelineArticle)
      .mockRejectedValueOnce(
        new FeedRequestError(
          "UNTRACEABLE_REWRITE_NUMBER",
          "The final candidate still contained an unsupported number.",
          undefined,
          422,
          "debug-retry-1",
          true,
        ),
      )
      .mockResolvedValueOnce({
        article: {
          ...newArticle,
          id: "retry-story",
          status: "rewritten",
          rewrittenText: "安全標題\n\n安全而完整的新聞正文。",
        },
        finalText: "安全標題\n\n安全而完整的新聞正文。",
        validation: { status: "passed_after_retry", attempts: 3 },
      });
    const user = userEvent.setup();
    render(<PipelineWorkspace initialModel="grok-4.5" />);

    await screen.findByRole("heading", { level: 2, name: newArticle.title }, { timeout: 15_000 });
    await user.click(screen.getByRole("button", { name: "Rewrite top 5 in Chinese" }));

    expect(await screen.findByText(/Rewrote 1 of 1 popular story group/u)).toBeTruthy();
    expect(rewritePipelineArticle).toHaveBeenCalledTimes(2);
    const firstInput = vi.mocked(rewritePipelineArticle).mock.calls[0]?.[1];
    const secondInput = vi.mocked(rewritePipelineArticle).mock.calls[1]?.[1];
    expect(secondInput?.debugBatchId).toBe(firstInput?.debugBatchId);
    expect(screen.queryByText(/Could not rewrite/u)).toBeNull();
  }, 20_000);

  it("finishes all five story groups across validation and network retries", async () => {
    const newArticle = {
      ...article,
      status: "new" as const,
      rewrittenText: null,
    };
    mockArticleLoad(newArticle);
    const stories = Array.from({ length: 5 }, (_, index) => ({
      articleId: `top-story-${index + 1}`,
      title: `Top story ${index + 1}`,
      sourceCount: 1,
      reportCount: 1,
      publishedAt: (newArticle.pubDate ?? 0) - index,
      relatedArticleIds: [`top-story-${index + 1}`],
    }));
    vi.mocked(listPopularPipelineStories).mockResolvedValue({ stories });
    const attempts = new Map<string, number>();
    vi.mocked(rewritePipelineArticle).mockImplementation(async (id) => {
      const attempt = (attempts.get(id) ?? 0) + 1;
      attempts.set(id, attempt);
      if (id === "top-story-2" && attempt === 1) {
        throw new FeedRequestError(
          "UNTRACEABLE_REWRITE_NUMBER",
          "A focused validation repair is required.",
          undefined,
          422,
          "debug-five-validation",
          true,
        );
      }
      if (id === "top-story-4" && attempt === 1) {
        throw new TypeError("The successful response was lost.");
      }
      return {
        article: {
          ...newArticle,
          id,
          status: "rewritten" as const,
          rewrittenText: `${id}標題\n\n${id}完整新聞正文。`,
        },
        finalText: `${id}標題\n\n${id}完整新聞正文。`,
        validation: { status: "passed_after_retry" as const, attempts: 3 as const },
      };
    });
    const user = userEvent.setup();
    render(<PipelineWorkspace initialModel="grok-4.5" />);

    await screen.findByRole("heading", { level: 2, name: newArticle.title }, { timeout: 15_000 });
    await user.click(screen.getByRole("button", { name: "Rewrite top 5 in Chinese" }));

    expect(await screen.findByText(/Rewrote 5 of 5 popular story groups/u)).toBeTruthy();
    expect(rewritePipelineArticle).toHaveBeenCalledTimes(7);
    expect(Object.fromEntries(attempts)).toEqual({
      "top-story-1": 1,
      "top-story-2": 2,
      "top-story-3": 1,
      "top-story-4": 2,
      "top-story-5": 1,
    });
    const batchIds = new Set(
      vi.mocked(rewritePipelineArticle).mock.calls.map(([, input]) => input?.debugBatchId),
    );
    expect(batchIds.size).toBe(1);
    expect([...batchIds][0]).toEqual(expect.any(String));
    expect(screen.queryByText(/Could not rewrite/u)).toBeNull();
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

  it("imports valid scraper rows even when another row is malformed", async () => {
    mockArticleLoad(article);
    vi.mocked(importScrapedArticles).mockResolvedValue({ imported: 1, skipped: 0, sources: 1 });
    const user = userEvent.setup();
    const { container } = render(<PipelineWorkspace initialModel="grok-4.5" />);
    await screen.findByDisplayValue("Editorial headline", {}, { timeout: 15_000 });

    const validRecord = {
      source: "unwire",
      title: "Usable scraped article",
      url: "https://unwire.example/usable",
      author: "News Desk",
      published_at: "2026-08-09T03:00:00Z",
      content_text: "Complete saved source text.",
      image_url: "https://unwire.example/usable.webp",
    };
    const invalidRecord = {
      source: "oncc",
      title: "Empty scrape",
      url: "https://on.cc/empty",
      content_text: "",
    };
    const input = container.querySelector<HTMLInputElement>("#scraped-news-import");
    expect(input).not.toBeNull();
    await user.upload(
      input!,
      new File([JSON.stringify([validRecord, invalidRecord])], "combined.json", {
        type: "application/json",
      }),
    );

    await waitFor(() =>
      expect(importScrapedArticles).toHaveBeenCalledWith([
        {
          source: "unwire",
          title: "Usable scraped article",
          url: "https://unwire.example/usable",
          author: "News Desk",
          publishedAt: "2026-08-09T03:00:00Z",
          contentText: "Complete saved source text.",
          imageUrl: "https://unwire.example/usable.webp",
        },
      ]),
    );
    expect(await screen.findByText(/1 invalid record was skipped/u)).toBeTruthy();
  }, 20_000);
});
