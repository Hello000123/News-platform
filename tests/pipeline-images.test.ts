import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getNewsImage } from "@/app/api/news-images/[key]/route";
import {
  DELETE as removeArticleImage,
  POST as uploadArticleImage,
} from "@/app/api/pipeline/articles/[id]/image/route";
import {
  removePipelineArticleImage,
  uploadPipelineArticleImage,
} from "@/lib/client/feeds-api";
import type { PipelineArticleView } from "@/lib/shared/feeds-contracts";

const stubs = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  getArticle: vi.fn(),
  updateArticle: vi.fn(),
  bucketGet: vi.fn(),
  bucketPut: vi.fn(),
  bucketDelete: vi.fn(),
}));

vi.mock("@/lib/server/auth/guards", () => ({
  requireApiSession: stubs.requireApiSession,
}));

vi.mock("@/lib/server/auth/database", () => ({
  getDatabase: () => ({ testDatabase: true }),
}));

vi.mock("@/lib/server/feeds/repository", () => ({
  getPipelineArticleById: stubs.getArticle,
  updatePipelineArticlePost: stubs.updateArticle,
}));

vi.mock("@/lib/server/uploads/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/uploads/storage")>()),
  getNewsImageBucket: () => ({
    get: stubs.bucketGet,
    put: stubs.bucketPut,
    delete: stubs.bucketDelete,
  }),
}));

const ORIGIN = "http://localhost";
const PREVIOUS_KEY = "a".repeat(32);
const validPng = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);

function article(overrides: Partial<PipelineArticleView> = {}): PipelineArticleView {
  return {
    id: "article-1",
    feedId: "feed-1",
    feedName: "Test feed",
    title: "Original headline",
    url: "https://example.test/story",
    description: null,
    author: null,
    pubDate: null,
    status: "rewritten",
    rewrittenText: "Edited headline\n\nEdited body.",
    sourceText: "Source body.",
    imageUrl: `/api/news-images/${PREVIOUS_KEY}?v=1`,
    category: "technology",
    mergedIntoArticleId: null,
    publishedAt: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function routeContext(value: string, parameter: "id" | "key" = "id") {
  return { params: Promise.resolve({ [parameter]: value }) } as never;
}

function uploadRequest(file: File) {
  const formData = new FormData();
  formData.set("file", file);
  return new Request(`${ORIGIN}/api/pipeline/articles/article-1/image`, {
    method: "POST",
    headers: { Origin: ORIGIN, "X-CSRF-Token": "test-token" },
    body: formData,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  stubs.requireApiSession.mockResolvedValue({
    user: { id: "editor-1", role: "client" },
  });
  let storedArticle = article();
  stubs.getArticle.mockImplementation(async () => storedArticle);
  stubs.updateArticle.mockImplementation(
    async (_database: unknown, _id: string, input: { imageUrl?: string | null }) => {
      storedArticle = { ...storedArticle, imageUrl: input.imageUrl };
      return true;
    },
  );
  stubs.bucketPut.mockResolvedValue(undefined);
  stubs.bucketDelete.mockResolvedValue(undefined);
  stubs.bucketGet.mockResolvedValue(null);
});

describe("pipeline article image API", () => {
  it("validates, stores, persists, and replaces an uploaded image", async () => {
    const buffer = validPng.buffer.slice(
      validPng.byteOffset,
      validPng.byteOffset + validPng.byteLength,
    ) as ArrayBuffer;
    const response = await uploadArticleImage(
      uploadRequest(new File([buffer], "editor-photo.png", { type: "image/png" })),
      routeContext("article-1"),
    );
    const body = (await response.json()) as {
      article: PipelineArticleView;
      imageUrl: string;
    };

    expect(response.status).toBe(200);
    expect(body.imageUrl).toMatch(
      /^\/api\/news-images\/[0-9a-f]{32}\?v=\d+$/u,
    );
    expect(body.article.imageUrl).toBe(body.imageUrl);
    expect(stubs.bucketPut).toHaveBeenCalledWith(
      expect.stringMatching(/^news-images\/[0-9a-f]{32}$/u),
      expect.any(Uint8Array),
      expect.objectContaining({
        httpMetadata: expect.objectContaining({ contentType: "image/png" }),
        customMetadata: { kind: "news-image" },
      }),
    );
    expect(stubs.updateArticle).toHaveBeenCalledWith(
      expect.anything(),
      "article-1",
      { imageUrl: body.imageUrl },
    );
    expect(stubs.bucketDelete).toHaveBeenCalledWith(
      `news-images/${PREVIOUS_KEY}`,
    );
  });

  it("rejects non-images and corrupt image signatures before storage", async () => {
    const documentResponse = await uploadArticleImage(
      uploadRequest(
        new File(["%PDF-1.4"], "briefing.pdf", { type: "application/pdf" }),
      ),
      routeContext("article-1"),
    );
    expect(documentResponse.status).toBe(400);
    expect(await documentResponse.json()).toMatchObject({
      error: { code: "UNSUPPORTED_IMAGE_TYPE" },
    });

    const corruptResponse = await uploadArticleImage(
      uploadRequest(
        new File([Uint8Array.from([1, 2, 3])], "photo.png", {
          type: "image/png",
        }),
      ),
      routeContext("article-1"),
    );
    expect(corruptResponse.status).toBe(400);
    expect(await corruptResponse.json()).toMatchObject({
      error: { code: "FILE_CORRUPTED" },
    });
    expect(stubs.bucketPut).not.toHaveBeenCalled();
  });

  it("deletes a managed object before clearing its article URL", async () => {
    const response = await removeArticleImage(
      new Request(`${ORIGIN}/api/pipeline/articles/article-1/image`, {
        method: "DELETE",
        headers: { Origin: ORIGIN, "X-CSRF-Token": "test-token" },
      }),
      routeContext("article-1"),
    );

    expect(response.status).toBe(200);
    expect(stubs.bucketDelete).toHaveBeenCalledWith(
      `news-images/${PREVIOUS_KEY}`,
    );
    expect(stubs.updateArticle).toHaveBeenCalledWith(
      expect.anything(),
      "article-1",
      { imageUrl: null },
    );
    expect(await response.json()).toMatchObject({ article: { imageUrl: null } });
  });
});

describe("public news image delivery", () => {
  it("rejects invalid capability keys without querying storage", async () => {
    const response = await getNewsImage(
      new Request(`${ORIGIN}/api/news-images/../account-requests/secret`),
      routeContext("../account-requests/secret", "key"),
    );
    expect(response.status).toBe(404);
    expect(stubs.bucketGet).not.toHaveBeenCalled();
  });

  it("serves only an image object with immutable caching and an ETag", async () => {
    const key = "b".repeat(32);
    stubs.bucketGet.mockResolvedValue({
      body: new Response(validPng).body,
      size: validPng.byteLength,
      httpEtag: '"image-etag"',
      httpMetadata: { contentType: "image/png" },
    });
    const response = await getNewsImage(
      new Request(`${ORIGIN}/api/news-images/${key}`),
      routeContext(key, "key"),
    );

    expect(response.status).toBe(200);
    expect(stubs.bucketGet).toHaveBeenCalledWith(`news-images/${key}`);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("etag")).toBe('"image-etag"');
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(validPng);
  });
});

describe("pipeline image client helpers", () => {
  it("uses FormData without overriding its content type and supports removal", async () => {
    const current = article({ imageUrl: null });
    const uploadedUrl = `/api/news-images/${"c".repeat(32)}?v=2`;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ article: { ...current, imageUrl: uploadedUrl }, imageUrl: uploadedUrl }),
      )
      .mockResolvedValueOnce(Response.json({ article: current }));
    vi.stubGlobal("fetch", fetchMock);

    await uploadPipelineArticleImage(
      "article/with spaces",
      new File([validPng], "photo.png", { type: "image/png" }),
    );
    await removePipelineArticleImage("article/with spaces");

    const [uploadUrl, uploadInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(uploadUrl).toBe(
      "/api/pipeline/articles/article%2Fwith%20spaces/image",
    );
    expect(uploadInit.method).toBe("POST");
    expect(uploadInit.body).toBeInstanceOf(FormData);
    expect(
      Object.keys(uploadInit.headers as Record<string, string>).some(
        (name) => name.toLowerCase() === "content-type",
      ),
    ).toBe(false);

    const [, removeInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(removeInit.method).toBe("DELETE");
  });
});
