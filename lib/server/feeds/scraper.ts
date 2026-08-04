import { prepareSourceSnapshot } from "@/lib/server/agents/workflow";
import { AppError } from "@/lib/server/errors";
import { SourceContextError } from "@/lib/server/sources/source-context";
import type { SourceSnapshot } from "@/lib/shared/contracts";

function sourceErrorStatus(code: SourceContextError["code"]) {
  if (code === "SOURCE_FETCH_TIMEOUT") return 504;
  if (code === "SOURCE_TOO_LARGE") return 413;
  if (code === "UNSUPPORTED_SOURCE_TYPE") return 415;
  if (code === "INVALID_SOURCE_URL" || code === "NON_PUBLIC_SOURCE") return 400;
  return 502;
}

function mapSourceError(error: SourceContextError) {
  const retryable = ![
    "INVALID_SOURCE_URL",
    "NON_PUBLIC_SOURCE",
    "SOURCE_TOO_LARGE",
    "UNSUPPORTED_SOURCE_TYPE",
  ].includes(error.code);
  return new AppError(error.code, error.message, sourceErrorStatus(error.code), {
    cause: error,
    publicDetails: { retryable },
  });
}

export async function loadArticleContent(url: string): Promise<SourceSnapshot> {
  try {
    return await prepareSourceSnapshot({ draft: "", sourceUrl: url });
  } catch (error) {
    if (error instanceof SourceContextError) throw mapSourceError(error);
    throw error;
  }
}
