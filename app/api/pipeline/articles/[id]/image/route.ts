import { getDatabase } from "@/lib/server/auth/database";
import { requireApiSession } from "@/lib/server/auth/guards";
import { authErrorResponse } from "@/lib/server/auth/http";
import { AppError } from "@/lib/server/errors";
import {
  getPipelineArticleById,
  updatePipelineArticlePost,
} from "@/lib/server/feeds/repository";
import { jsonResponse } from "@/lib/server/http";
import { validateUploadedFile } from "@/lib/server/uploads/file-processing";
import {
  getNewsImageBucket,
  managedNewsImageKey,
  newsImageStorageKey,
} from "@/lib/server/uploads/storage";
import {
  isImageUploadMime,
  MAX_UPLOAD_BYTES,
  uploadExtension,
} from "@/lib/shared/file-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MULTIPART_BYTES = MAX_UPLOAD_BYTES + 128 * 1024;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const PUBLIC_IMAGE_CACHE = "public, max-age=31536000, immutable";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function imageFile(formData: FormData) {
  const candidate = formData.get("file");
  if (!(candidate instanceof File)) {
    throw new AppError(
      "IMAGE_REQUIRED",
      "Choose a PNG, JPEG, or WebP image before continuing.",
      400,
    );
  }
  return candidate;
}

function assertSupportedImageMetadata(file: File) {
  if (
    !IMAGE_EXTENSIONS.has(uploadExtension(file.name)) ||
    !isImageUploadMime(file.type)
  ) {
    throw new AppError(
      "UNSUPPORTED_IMAGE_TYPE",
      "Choose a PNG, JPEG, or WebP image.",
      400,
    );
  }
}

function imageTooLarge() {
  return new AppError(
    "FILE_TOO_LARGE",
    "The selected image is larger than the 10 MB limit.",
    413,
  );
}

async function readLimitedMultipartFormData(request: Request, contentType: string) {
  if (!request.body) {
    throw new AppError("INVALID_UPLOAD", "The uploaded image could not be read.", 400);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_MULTIPART_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw imageTooLarge();
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return await new Response(body.buffer as ArrayBuffer, {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch (error) {
    throw new AppError(
      "INVALID_UPLOAD",
      "The uploaded image could not be read.",
      400,
      { cause: error },
    );
  }
}

async function readImageUpload(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    throw new AppError(
      "UNSUPPORTED_MEDIA_TYPE",
      "Upload the image using multipart form data.",
      415,
    );
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) {
    throw imageTooLarge();
  }

  const formData = await readLimitedMultipartFormData(request, contentType);
  const file = imageFile(formData);
  assertSupportedImageMetadata(file);
  const validated = await validateUploadedFile(file);
  if (!isImageUploadMime(validated.mimeType)) {
    throw new AppError(
      "UNSUPPORTED_IMAGE_TYPE",
      "Choose a PNG, JPEG, or WebP image.",
      400,
    );
  }
  return validated;
}

function assertEditableArticle<T extends { mergedIntoArticleId?: string | null }>(
  article: T | null,
): asserts article is T {
  if (!article) {
    throw new AppError("ARTICLE_NOT_FOUND", "The article was not found.", 404);
  }
  if (article.mergedIntoArticleId) {
    throw new AppError(
      "ARTICLE_ALREADY_MERGED",
      "This duplicate report has already been combined into another pipeline story.",
      409,
    );
  }
}

function storageFailure(message: string, error: unknown) {
  return new AppError(
    "NEWS_IMAGE_STORAGE_UNAVAILABLE",
    message,
    503,
    { cause: error },
  );
}

export async function POST(request: Request, context: RouteContext) {
  try {
    await requireApiSession(request, ["client", "employee"], { csrf: true });
    const { id } = await context.params;
    const database = getDatabase();
    const article = await getPipelineArticleById(database, id);
    assertEditableArticle(article);

    const image = await readImageUpload(request);
    const bucket = getNewsImageBucket();
    const capabilityKey = crypto.randomUUID().replaceAll("-", "");
    const storageKey = newsImageStorageKey(capabilityKey);
    const imageUrl = `/api/news-images/${capabilityKey}?v=${Date.now()}`;

    try {
      await bucket.put(storageKey, image.bytes, {
        httpMetadata: {
          contentType: image.mimeType,
          cacheControl: PUBLIC_IMAGE_CACHE,
        },
        customMetadata: { kind: "news-image" },
      });
    } catch (error) {
      throw storageFailure(
        "The image could not be stored. Try again later.",
        error,
      );
    }

    let changed: boolean;
    try {
      changed = await updatePipelineArticlePost(database, id, { imageUrl });
    } catch (error) {
      await bucket.delete(storageKey).catch(() => undefined);
      throw error;
    }
    if (!changed) {
      await bucket.delete(storageKey).catch(() => undefined);
      throw new AppError(
        "ARTICLE_UPDATE_CONFLICT",
        "This article changed while the image was being saved. Refresh the pipeline and try again.",
        409,
      );
    }

    const updated = await getPipelineArticleById(database, id);
    assertEditableArticle(updated);

    const previousCapabilityKey = managedNewsImageKey(article.imageUrl);
    if (previousCapabilityKey && previousCapabilityKey !== capabilityKey) {
      try {
        await bucket.delete(newsImageStorageKey(previousCapabilityKey));
      } catch (error) {
        // The database already points at the new capability URL. Keep the editor's
        // successful replacement and surface the failed orphan cleanup to logs.
        console.error("[news-images] Failed to remove replaced image", {
          articleId: id,
          errorType: error instanceof Error ? error.name : typeof error,
        });
      }
    }

    return jsonResponse({ article: updated, imageUrl });
  } catch (error) {
    return authErrorResponse(error, {
      operation: "pipeline.article.image.upload",
      request,
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    await requireApiSession(request, ["client", "employee"], { csrf: true });
    const { id } = await context.params;
    const database = getDatabase();
    const article = await getPipelineArticleById(database, id);
    assertEditableArticle(article);

    const capabilityKey = managedNewsImageKey(article.imageUrl);
    if (capabilityKey) {
      try {
        await getNewsImageBucket().delete(newsImageStorageKey(capabilityKey));
      } catch (error) {
        throw storageFailure(
          "The uploaded image could not be removed. Try again later.",
          error,
        );
      }
    }

    const changed = await updatePipelineArticlePost(database, id, {
      imageUrl: null,
    });
    if (!changed) {
      throw new AppError(
        "ARTICLE_UPDATE_CONFLICT",
        "This article changed while the image was being removed. Refresh the pipeline and try again.",
        409,
      );
    }

    const updated = await getPipelineArticleById(database, id);
    assertEditableArticle(updated);
    return jsonResponse({ article: updated });
  } catch (error) {
    return authErrorResponse(error, {
      operation: "pipeline.article.image.remove",
      request,
    });
  }
}
