import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST as uploadPresentationImage } from "@/app/api/employee/presentation-images/route";
import {
  uploadPresentationImage as uploadPresentationImageClient,
} from "@/lib/client/article-presentation-api";

const stubs = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  bucketPut: vi.fn(),
}));

vi.mock("@/lib/server/auth/guards", () => ({
  requireApiSession: stubs.requireApiSession,
}));

vi.mock("@/lib/server/uploads/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/uploads/storage")>()),
  getNewsImageBucket: () => ({
    put: stubs.bucketPut,
  }),
}));

const ORIGIN = "http://localhost";
const validPng = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);

function uploadRequest(file: File) {
  const formData = new FormData();
  formData.set("file", file);
  return new Request(`${ORIGIN}/api/employee/presentation-images`, {
    method: "POST",
    headers: { Origin: ORIGIN, "X-CSRF-Token": "test-token" },
    body: formData,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  stubs.requireApiSession.mockResolvedValue({
    user: { id: "employee-1", role: "employee" },
  });
  stubs.bucketPut.mockResolvedValue(undefined);
});

describe("presentation image upload API", () => {
  it("stores an uploaded image and returns a managed news-image URL", async () => {
    const buffer = validPng.buffer.slice(
      validPng.byteOffset,
      validPng.byteOffset + validPng.byteLength,
    ) as ArrayBuffer;
    const response = await uploadPresentationImage(
      uploadRequest(
        new File([buffer], "replacement 照片.png", { type: "image/png" }),
      ),
    );
    const body = (await response.json()) as { imageUrl: string };

    expect(response.status).toBe(200);
    expect(body.imageUrl).toMatch(
      /^\/api\/news-images\/[0-9a-f]{32}\?v=\d+$/u,
    );
    expect(stubs.requireApiSession).toHaveBeenCalledWith(
      expect.anything(),
      ["employee"],
      { csrf: true },
    );
    expect(stubs.bucketPut).toHaveBeenCalledWith(
      expect.stringMatching(/^news-images\/[0-9a-f]{32}$/u),
      expect.any(Uint8Array),
      expect.objectContaining({
        httpMetadata: expect.objectContaining({
          contentType: "image/png",
          cacheControl: "public, max-age=31536000, immutable",
        }),
        customMetadata: { kind: "news-image" },
      }),
    );
  });

  it("rejects non-images and corrupt image signatures before storage", async () => {
    const documentResponse = await uploadPresentationImage(
      uploadRequest(
        new File(["%PDF-1.4"], "briefing.pdf", { type: "application/pdf" }),
      ),
    );
    expect(documentResponse.status).toBe(400);
    expect(await documentResponse.json()).toMatchObject({
      error: { code: "UNSUPPORTED_IMAGE_TYPE" },
    });

    const corruptResponse = await uploadPresentationImage(
      uploadRequest(
        new File([Uint8Array.from([1, 2, 3])], "photo.png", {
          type: "image/png",
        }),
      ),
    );
    expect(corruptResponse.status).toBe(400);
    expect(await corruptResponse.json()).toMatchObject({
      error: { code: "FILE_CORRUPTED" },
    });
    expect(stubs.bucketPut).not.toHaveBeenCalled();
  });
});

describe("presentation image client helper", () => {
  it("posts FormData without overriding its content type", async () => {
    const uploadedUrl = `/api/news-images/${"d".repeat(32)}?v=2`;
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ imageUrl: uploadedUrl }));
    vi.stubGlobal("fetch", fetchMock);

    await uploadPresentationImageClient(
      new File([validPng], "photo.png", { type: "image/png" }),
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/employee/presentation-images");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect(
      Object.keys(init.headers as Record<string, string>).some(
        (name) => name.toLowerCase() === "content-type",
      ),
    ).toBe(false);
  });
});
