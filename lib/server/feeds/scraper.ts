import { prepareSourceSnapshot } from "@/lib/server/agents/workflow";
import { AppError } from "@/lib/server/errors";
import { SourceContextError } from "@/lib/server/sources/source-context";
import { sourceSnapshotSchema, type SourceSnapshot } from "@/lib/shared/contracts";
import type {
  PipelineArticleView,
  PipelineRewriteSourceOrigin,
} from "@/lib/shared/feeds-contracts";

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

export interface ResolvedPipelineArticleSource {
  readonly source: SourceSnapshot;
  readonly origin: PipelineRewriteSourceOrigin;
}

export function pipelineArticleBodyText(
  article: PipelineArticleSource,
  source: SourceSnapshot,
) {
  const text = source.primaryText.trim();
  const title = (source.linkedTitle ?? article.title).trim();
  if (!title || !text.startsWith(title)) return text;
  if (text === title) return "";
  const remainder = text.slice(title.length);
  return /^\s+/u.test(remainder) ? remainder.trimStart() : text;
}

/**
 * Uses captured scraper text first, then the live article, and finally the RSS
 * preview. Feed-only stories therefore remain rewritable during a temporary
 * publisher outage without pretending that a teaser is a complete report.
 */
export async function resolvePipelineArticleSource(
  article: PipelineArticleSource,
  liveLoader: (url: string) => Promise<SourceSnapshot> = loadArticleContent,
): Promise<ResolvedPipelineArticleSource> {
  const savedText = article.sourceText?.trim();
  if (savedText) {
    return { source: snapshotFromSavedText(article, savedText), origin: "saved_scraper" };
  }

  try {
    const source = await liveLoader(article.url);
    if (!pipelineArticleBodyText(article, source)) {
      throw new AppError(
        "EMPTY_SOURCE_CONTENT",
        "The publisher page did not contain a usable article body.",
        422,
        { publicDetails: { retryable: false } },
      );
    }
    return { source, origin: "live_page" };
  } catch (error) {
    const preview = article.description?.trim();
    if (preview) {
      return { source: snapshotFromSavedText(article, preview), origin: "rss_preview" };
    }
    throw error;
  }
}

export async function loadPipelineArticleSource(
  article: PipelineArticleSource,
  liveLoader: (url: string) => Promise<SourceSnapshot> = loadArticleContent,
) {
  return (await resolvePipelineArticleSource(article, liveLoader)).source;
}
