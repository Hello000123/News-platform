import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getPipelineArticleContent } from "@/app/api/pipeline/articles/[id]/content/route";
import type { PipelineArticleView } from "@/lib/shared/feeds-contracts";

const stubs = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  getArticle: vi.fn(),
  cacheSourceText: vi.fn(),
  resolveSource: vi.fn(),
}));

vi.mock("@/lib/server/auth/guards", () => ({
  requireApiSession: stubs.requireApiSession,
}));

vi.mock("@/lib/server/auth/database", () => ({
  getDatabase: () => ({ testDatabase: true }),
}));

vi.mock("@/lib/server/feeds/repository", () => ({
  getPipelineArticleById: stubs.getArticle,
  cachePipelineArticleSourceText: stubs.cacheSourceText,
}));

vi.mock("@/lib/server/feeds/scraper", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/feeds/scraper")>()),
  resolvePipelineArticleSource: stubs.resolveSource,
}));

function article(overrides: Partial<PipelineArticleView> = {}): PipelineArticleView {
  return {
    id: "article-1",
    feedId: "feed-1",
    feedName: "Publisher",
    title: "Complete report headline",
    url: "https://publisher.example/report",
    description: "Short RSS preview.",
    author: null,
    pubDate: null,
    status: "new",
    rewrittenText: null,
    sourceText: null,
    imageUrl: null,
    category: null,
    mergedIntoArticleId: null,
    publishedAt: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function routeContext(id = "article-1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  stubs.requireApiSession.mockResolvedValue({
    user: { id: "editor-1", role: "client" },
  });
});

describe("pipeline article content API", () => {
  it("caches a complete live body and returns the headline only once", async () => {
    let storedArticle = article();
    stubs.getArticle.mockImplementation(async () => storedArticle);
    stubs.cacheSourceText.mockImplementation(async (_database, _id, sourceText) => {
      storedArticle = { ...storedArticle, sourceText };
      return true;
    });
    stubs.resolveSource.mockResolvedValue({
      origin: "live_page",
      source: {
        primaryText: "Complete report headline\n\nComplete live article body.",
        userDraft: "",
        sourceUrl: storedArticle.url,
        linkedTitle: storedArticle.title,
        imageContext: [],
      },
    });

    const response = await getPipelineArticleContent(
      new Request("http://localhost/api/pipeline/articles/article-1/content"),
      routeContext(),
    );
    const body = (await response.json()) as {
      article: PipelineArticleView;
      content: string;
      sourceOrigin: string;
    };

    expect(response.status).toBe(200);
    expect(stubs.cacheSourceText).toHaveBeenCalledWith(
      expect.anything(),
      "article-1",
      "Complete live article body.",
    );
    expect(body.article.sourceText).toBe("Complete live article body.");
    expect(body.sourceOrigin).toBe("live_page");
    expect(body.content).toBe(
      "[Article title]\nComplete report headline\n\nComplete live article body.",
    );
    expect(body.content.match(/Complete report headline/gu)).toHaveLength(1);
  });

  it("does not cache an RSS preview as if it were a complete article", async () => {
    const storedArticle = article();
    stubs.getArticle.mockResolvedValue(storedArticle);
    stubs.resolveSource.mockResolvedValue({
      origin: "rss_preview",
      source: {
        primaryText: "Short RSS preview.",
        userDraft: "",
        sourceUrl: storedArticle.url,
        linkedTitle: storedArticle.title,
        imageContext: [],
      },
    });

    const response = await getPipelineArticleContent(
      new Request("http://localhost/api/pipeline/articles/article-1/content"),
      routeContext(),
    );
    const body = (await response.json()) as { content: string; sourceOrigin: string };

    expect(response.status).toBe(200);
    expect(stubs.cacheSourceText).not.toHaveBeenCalled();
    expect(body.sourceOrigin).toBe("rss_preview");
    expect(body.content).toContain("Short RSS preview.");
  });
});
