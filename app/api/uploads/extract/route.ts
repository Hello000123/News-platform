import { requireApiSession } from "@/lib/server/auth/guards";
import { authErrorResponse } from "@/lib/server/auth/http";
import { AppError } from "@/lib/server/errors";
import { jsonResponse } from "@/lib/server/http";
import { extractUploadedFile } from "@/lib/server/uploads/file-processing";
import { MAX_DRAFT_CHARS } from "@/lib/shared/contracts";
import {
  MAX_UPLOAD_BYTES,
  totalUploadBytes,
  validateUploadCollection,
} from "@/lib/shared/file-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MULTIPART_BYTES = MAX_UPLOAD_BYTES + 1024 * 1024;

function uploadedFiles(formData: FormData) {
  const candidates = formData.getAll("files");
  const legacyCandidates = candidates.length ? [] : formData.getAll("file");
  const files = [...candidates, ...legacyCandidates].filter(
    (candidate): candidate is File =>
      candidate instanceof File && Boolean(candidate.name.trim()),
  );
  if (!files.length) {
    throw new AppError(
      "FILE_REQUIRED",
      "Choose one or more supported files before continuing.",
      400,
    );
  }
  return files;
}

export async function POST(request: Request) {
  try {
    await requireApiSession(request, ["client", "employee"], { csrf: true });
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("multipart/form-data;")) {
      throw new AppError(
        "UNSUPPORTED_MEDIA_TYPE",
        "Upload the file using multipart form data.",
        415,
      );
    }
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) {
      throw new AppError(
        "FILE_TOO_LARGE",
        "The combined size of all selected files cannot exceed the 10 MB limit.",
        413,
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      throw new AppError(
        "INVALID_UPLOAD",
        "The uploaded file could not be read.",
        400,
        { cause: error },
      );
    }
    const files = uploadedFiles(formData);
    const collection = validateUploadCollection(files);
    if ("error" in collection) {
      const tooLarge =
        totalUploadBytes(files) > MAX_UPLOAD_BYTES ||
        files.some((file) => file.size > MAX_UPLOAD_BYTES);
      throw new AppError(
        tooLarge ? "UPLOAD_TOTAL_TOO_LARGE" : "INVALID_UPLOAD_SELECTION",
        collection.error ?? "The selected files are invalid.",
        tooLarge ? 413 : 400,
      );
    }
    const extractedFiles = [];
    for (const file of files) {
      extractedFiles.push(await extractUploadedFile(file));
    }
    const fileResults = extractedFiles.map((extracted) => ({
      name: extracted.safeName,
      type: extracted.formatLabel,
      mimeType: extracted.mimeType,
      size: extracted.size,
      status: "ready" as const,
      content: extracted.content,
      truncated: extracted.truncated,
    }));
    const combinedContent = extractedFiles
      .map((extracted) => extracted.content)
      .join("\n\n");
    const combinedTruncated = combinedContent.length > MAX_DRAFT_CHARS;
    return jsonResponse({
      file: fileResults[0],
      files: fileResults,
      content: combinedContent.slice(0, MAX_DRAFT_CHARS),
      truncated:
        combinedTruncated || extractedFiles.some((file) => file.truncated),
    });
  } catch (error) {
    return authErrorResponse(error, {
      operation: "upload.extract",
      request,
    });
  }
}
