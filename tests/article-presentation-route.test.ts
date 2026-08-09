import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/server/errors";
import { createDefaultArticlePresentation } from "@/lib/shared/article-presentation";

const mocks = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  getDatabase: vi.fn(),
  getPipelineArticleById: vi.fn(),
  getArticlePresentationState: vi.fn(),
  saveArticlePresentationDraft: vi.fn(),
  publishArticlePresentation: vi.fn(),
}));

vi.mock("@/lib/server/auth/guards", () => ({
  requireApiSession: mocks.requireApiSession,
}));
vi.mock("@/lib/server/auth/database", () => ({
  getDatabase: mocks.getDatabase,
}));
vi.mock("@/lib/server/feeds/repository", () => ({
  getPipelineArticleById: mocks.getPipelineArticleById,
}));
vi.mock("@/lib/server/article-presentation", () => ({
  getArticlePresentationState: mocks.getArticlePresentationState,
  saveArticlePresentationDraft: mocks.saveArticlePresentationDraft,
  publishArticlePresentation: mocks.publishArticlePresentation,
}));

import {
  GET,
  PATCH,
} from "@/app/api/employee/articles/[id]/presentation/route";

const article = {
  id: "article-1",
  feedId: "feed-1",
  feedName: "Desk",
  title: "Headline",
  url: "https://example.test/article",
  description: null,
  author: null,
  pubDate: null,
  status: "approved" as const,
  rewrittenText: "Headline\n\nArticle body.",
  sourceText: null,
  imageUrl: null,
  category: null,
  mergedIntoArticleId: null,
  publishedAt: 10,
  createdAt: 10,
  updatedAt: 10,
};
const presentation = createDefaultArticlePresentation(10, [
  { id: "title", text: "Headline" },
  { id: "deck", text: "Article body." },
  { id: "body:0", text: "Article body." },
]);

describe("employee article presentation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiSession.mockResolvedValue({
      user: { id: "employee-1", role: "employee" },
    });
    mocks.getDatabase.mockReturnValue({});
    mocks.getPipelineArticleById.mockResolvedValue(article);
    mocks.getArticlePresentationState.mockResolvedValue({
      draft: presentation,
      published: presentation,
      draftUpdatedAt: null,
      publishedAt: 10,
      hasUnpublishedChanges: false,
    });
    mocks.saveArticlePresentationDraft.mockResolvedValue({
      presentation,
      savedAt: 11,
    });
    mocks.publishArticlePresentation.mockResolvedValue({
      presentation,
      publishedAt: 12,
    });
  });

  it("requires an employee session and CSRF before saving", async () => {
    const request = new Request(
      "https://pressready.example/api/employee/articles/article-1/presentation",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", presentation }),
      },
    );
    const response = await PATCH(request, {
      params: Promise.resolve({ id: "article-1" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.requireApiSession).toHaveBeenCalledWith(
      request,
      ["employee"],
      { csrf: true },
    );
    expect(mocks.saveArticlePresentationDraft).toHaveBeenCalledWith(
      {},
      article,
      presentation,
      "employee-1",
    );
  });

  it("returns forbidden without touching article data when authorization fails", async () => {
    mocks.requireApiSession.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "You do not have permission.", 403),
    );
    const request = new Request(
      "https://pressready.example/api/employee/articles/article-1/presentation",
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: "article-1" }),
    });

    expect(response.status).toBe(403);
    expect(mocks.getPipelineArticleById).not.toHaveBeenCalled();
  });
});
