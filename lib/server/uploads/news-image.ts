import { AppError } from "@/lib/server/errors";
import {
  validateUploadedFile,
  type ValidatedUpload,
} from "@/lib/server/uploads/file-processing";
import {
  isImageUploadMime,
  MAX_UPLOAD_BYTES,
  uploadExtension,
} from "@/lib/shared/file-upload";

export const MAX_NEWS_IMAGE_MULTIPART_BYTES = MAX_UPLOAD_BYTES + 128 * 1024;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

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

export function newsImageTooLarge() {
  return new AppError(
    "FILE_TOO_LARGE",
    "The selected image is larger than the 10 MB limit.",
    413,
  );
}

export function assertSupportedNewsImageMetadata(file: File) {
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

async function readLimitedMultipartFormData(
  request: Request,
  contentType: string,
) {
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
    if (totalBytes > MAX_NEWS_IMAGE_MULTIPART_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw newsImageTooLarge();
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

export async function readNewsImageUpload(request: Request): Promise<ValidatedUpload> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    throw new AppError(
      "UNSUPPORTED_MEDIA_TYPE",
      "Upload the image using multipart form data.",
      415,
    );
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_NEWS_IMAGE_MULTIPART_BYTES) {
    throw newsImageTooLarge();
  }

  const formData = await readLimitedMultipartFormData(request, contentType);
  const file = imageFile(formData);
  assertSupportedNewsImageMetadata(file);
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
