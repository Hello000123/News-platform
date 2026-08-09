import { beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_UPLOAD_BYTES } from "@/lib/shared/file-upload";

const mocks = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  extractUploadedFile: vi.fn(),
}));

vi.mock("@/lib/server/auth/guards", () => ({
  requireApiSession: mocks.requireApiSession,
}));
vi.mock("@/lib/server/uploads/file-processing", () => ({
  extractUploadedFile: mocks.extractUploadedFile,
}));

import { POST } from "@/app/api/uploads/extract/route";

function metadataFile(name: string, size: number) {
  const file = new File(["test"], name, { type: "application/pdf" });
  Object.defineProperty(file, "size", { configurable: true, value: size });
  return file;
}

function uploadRequest(files: readonly File[]) {
  const formData = new FormData();
  for (const file of files) formData.append("files", file);
  const request = new Request("https://pressready.example/api/uploads/extract", {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=test" },
  });
  vi.spyOn(request, "formData").mockResolvedValue(formData);
  return request;
}

describe("multi-file extraction route limits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiSession.mockResolvedValue({
      user: { id: "client-1", role: "client" },
    });
    mocks.extractUploadedFile.mockImplementation(async (file: File) => ({
      bytes: new Uint8Array([1]),
      extension: ".pdf",
      mimeType: "application/pdf",
      formatLabel: "PDF",
      safeName: file.name,
      size: file.size,
      content: `Content from ${file.name}`,
      truncated: false,
    }));
  });

  it("accepts several files whose combined size is exactly 10 MB", async () => {
    const files = [
      metadataFile("six.pdf", 6 * 1024 * 1024),
      metadataFile("four.pdf", 4 * 1024 * 1024),
    ];
    const response = await POST(uploadRequest(files));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      files: [
        { name: "six.pdf", size: 6 * 1024 * 1024 },
        { name: "four.pdf", size: 4 * 1024 * 1024 },
      ],
      content: "Content from six.pdf\n\nContent from four.pdf",
    });
    expect(mocks.extractUploadedFile).toHaveBeenCalledTimes(2);
  });

  it("rejects a collection one byte above 10 MB before processing content", async () => {
    const response = await POST(
      uploadRequest([
        metadataFile("six.pdf", 6 * 1024 * 1024),
        metadataFile("over.pdf", 4 * 1024 * 1024 + 1),
      ]),
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      error: {
        code: "UPLOAD_TOTAL_TOO_LARGE",
        message: expect.stringContaining("combined size"),
      },
    });
    expect(mocks.extractUploadedFile).not.toHaveBeenCalled();
  });

  it("rejects a single file larger than the combined limit", async () => {
    const response = await POST(
      uploadRequest([metadataFile("large.pdf", MAX_UPLOAD_BYTES + 1)]),
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      error: { code: "UPLOAD_TOTAL_TOO_LARGE" },
    });
    expect(mocks.extractUploadedFile).not.toHaveBeenCalled();
  });
});
