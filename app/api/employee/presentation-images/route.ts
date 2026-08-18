import { requireApiSession } from "@/lib/server/auth/guards";
import { authErrorResponse } from "@/lib/server/auth/http";
import { AppError } from "@/lib/server/errors";
import { jsonResponse } from "@/lib/server/http";
import { readNewsImageUpload } from "@/lib/server/uploads/news-image";
import {
  getNewsImageBucket,
  newsImageStorageKey,
} from "@/lib/server/uploads/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_IMAGE_CACHE = "public, max-age=31536000, immutable";

function storageFailure(message: string, error: unknown) {
  return new AppError(
    "NEWS_IMAGE_STORAGE_UNAVAILABLE",
    message,
    503,
    { cause: error },
  );
}

export async function POST(request: Request) {
  try {
    await requireApiSession(request, ["employee"], { csrf: true });

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

    return jsonResponse({ imageUrl });
  } catch (error) {
    return authErrorResponse(error, {
      operation: "employee.presentation-image.upload",
      request,
    });
  }
}
