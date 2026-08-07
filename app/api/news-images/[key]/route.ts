import { AppError } from "@/lib/server/errors";
import { errorResponse } from "@/lib/server/http";
import {
  getNewsImageBucket,
  isValidNewsImageKey,
  newsImageStorageKey,
} from "@/lib/server/uploads/storage";
import { isImageUploadMime } from "@/lib/shared/file-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_IMAGE_CACHE = "public, max-age=31536000, immutable";

interface RouteContext {
  params: Promise<{ key: string }>;
}

function notFound() {
  return new AppError("NEWS_IMAGE_NOT_FOUND", "The image was not found.", 404);
}

function responseHeaders(contentType: string, size: number, etag: string) {
  return new Headers({
    "Cache-Control": PUBLIC_IMAGE_CACHE,
    "Content-Length": String(size),
    "Content-Type": contentType,
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
  });
}

function etagMatches(request: Request, etag: string) {
  return (request.headers.get("if-none-match") ?? "")
    .split(",")
    .map((candidate) => candidate.trim())
    .some((candidate) => candidate === etag || candidate === "*");
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { key } = await context.params;
    if (!isValidNewsImageKey(key)) throw notFound();

    const object = await getNewsImageBucket().get(newsImageStorageKey(key));
    if (!object) throw notFound();

    const contentType = object.httpMetadata?.contentType?.toLowerCase() ?? "";
    if (!isImageUploadMime(contentType)) throw notFound();

    const headers = responseHeaders(contentType, object.size, object.httpEtag);
    if (etagMatches(request, object.httpEtag)) {
      headers.delete("Content-Length");
      return new Response(null, { status: 304, headers });
    }

    return new Response(object.body as unknown as BodyInit, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}
