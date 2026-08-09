import { AuthRequestError, csrfHeaders } from "@/lib/client/auth-api";

export interface ExtractedFileResult {
  name: string;
  type: string;
  mimeType: string;
  size: number;
  status: "ready";
  content: string;
  truncated: boolean;
}

export interface ExtractedFileResponse {
  file: ExtractedFileResult;
  files: ExtractedFileResult[];
  content: string;
  truncated: boolean;
}

export async function requestFileExtraction(filesInput: File | readonly File[]) {
  const files = filesInput instanceof File ? [filesInput] : [...filesInput];
  const formData = new FormData();
  for (const file of files) formData.append("files", file);
  const response = await fetch("/api/uploads/extract", {
    method: "POST",
    headers: {
      Accept: "application/json",
      ...csrfHeaders(),
    },
    body: formData,
    cache: "no-store",
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AuthRequestError(
      "INVALID_SERVER_RESPONSE",
      "The server returned an unreadable upload response.",
      undefined,
      response.status,
    );
  }
  if (!response.ok) {
    const errorBody = body as {
      error?: { code?: string; message?: string };
    };
    throw new AuthRequestError(
      errorBody.error?.code || "UPLOAD_FAILED",
      errorBody.error?.message || "The file could not be processed.",
      undefined,
      response.status,
    );
  }
  const result = body as Partial<ExtractedFileResponse> & {
    file?: Omit<ExtractedFileResult, "content" | "truncated">;
  };
  const normalizedFiles = Array.isArray(result.files)
    ? result.files
    : result.file
      ? [
          {
            ...result.file,
            content: result.content ?? "",
            truncated: Boolean(result.truncated),
          },
        ]
      : [];
  if (!normalizedFiles.length || normalizedFiles.length !== files.length) {
    throw new AuthRequestError(
      "INVALID_SERVER_RESPONSE",
      "The server did not return all extracted files.",
      undefined,
      response.status,
    );
  }
  return {
    file: normalizedFiles[0],
    files: normalizedFiles,
    content: result.content ?? "",
    truncated: Boolean(result.truncated),
  } satisfies ExtractedFileResponse;
}
