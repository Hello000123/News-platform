import { prepareSourceSnapshot } from "@/lib/server/agents/workflow";
import { AppError } from "@/lib/server/errors";
import { SourceContextError } from "@/lib/server/sources/source-context";
import { sourceSnapshotSchema, type SourceSnapshot } from "@/lib/shared/contracts";
import type { PipelineArticleView } from "@/lib/shared/feeds-contracts";

type PipelineArticleSource = Pick<
  PipelineArticleView,
  "title" | "url" | "description" | "sourceText"
>;

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

function snapshotFromSavedText(article: PipelineArticleSource, text: string) {
  return sourceSnapshotSchema.parse({
    primaryText: text.slice(0, 50_000),
    userDraft: "",
    sourceUrl: article.url,
    linkedTitle: article.title,
    imageContext: [],
  });
}

/**
 * Uses captured scraper text first, then the live article, and finally the RSS
 * preview. Feed-only stories therefore remain rewritable during a temporary
 * publisher outage without pretending that a teaser is a complete report.
 */
export async function loadPipelineArticleSource(
  article: PipelineArticleSource,
  liveLoader: (url: string) => Promise<SourceSnapshot> = loadArticleContent,
) {
  const savedText = article.sourceText?.trim();
  if (savedText) return snapshotFromSavedText(article, savedText);

  try {
    return await liveLoader(article.url);
  } catch (error) {
    const preview = article.description?.trim();
    if (preview) return snapshotFromSavedText(article, preview);
    throw error;
  }
}
