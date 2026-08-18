import { getDatabase } from "@/lib/server/auth/database";
import { requireApiSession } from "@/lib/server/auth/guards";
import { authErrorResponse } from "@/lib/server/auth/http";
import { AppError } from "@/lib/server/errors";
import {
  getPipelineArticleById,
  updatePipelineArticlePost,
} from "@/lib/server/feeds/repository";
import { jsonResponse } from "@/lib/server/http";
import { readNewsImageUpload } from "@/lib/server/uploads/news-image";
import {
  getNewsImageBucket,
  managedNewsImageKey,
  newsImageStorageKey,
} from "@/lib/server/uploads/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_IMAGE_CACHE = "public, max-age=31536000, immutable";

interface RouteContext {
  params: Promise<{ id: string }>;
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

    const image = await readNewsImageUpload(request);
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
