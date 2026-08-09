import type { D1Database } from "@cloudflare/workers-types";

import { rewriteWithFeedback } from "@/lib/server/agents/workflow";
import { getDatabase } from "@/lib/server/auth/database";
import { requireApiSession } from "@/lib/server/auth/guards";
import { recordAgentRequestAttempt } from "@/lib/server/auth/request-usage";
import { AppError } from "@/lib/server/errors";
import {
  cachePipelineArticleSourceText,
  commitPipelineArticleRewrite,
  getPipelineArticleById,
  getPipelineArticlesByIds,
  getPipelineRewriteCommit,
} from "@/lib/server/feeds/repository";
import {
  recordPipelineRewriteDebugLog,
  rewriteDebugFailureFields,
} from "@/lib/server/feeds/rewrite-debug";
import {
  pipelineArticleBodyText,
  resolvePipelineArticleSource,
} from "@/lib/server/feeds/scraper";
import { connectedStoryArticles } from "@/lib/server/feeds/popularity";
import { errorResponse, jsonResponse, readJsonRequest } from "@/lib/server/http";
import {
  DEFAULT_REWRITE_OUTPUT_LANGUAGE,
  rewriteContextSchema,
  sourceSnapshotSchema,
  type RewriteLengthOption,
  type RewriteContext,
  type SourceSnapshot,
} from "@/lib/shared/contracts";
import {
  pipelineRewriteInputSchema,
  type PipelineRewriteRequest,
  type PipelineRewriteSourceOrigin,
  type PipelineArticleView,
} from "@/lib/shared/feeds-contracts";
import { DEFAULT_SELECTABLE_MODEL } from "@/lib/shared/models";
import {
  COMBINED_PIPELINE_REWRITE_INSTRUCTION,
  formatSupportingReportPrompt,
  pipelineSourceSupportsDetailedRewrite,
  PIPELINE_REWRITE_FIDELITY_INSTRUCTION,
  SPARSE_PIPELINE_SOURCE_INSTRUCTION,
} from "@/lib/shared/pipeline-rewrite-instructions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const MAX_SUPPORTING_REPORT_CHARS = 50_000;
const MAX_SINGLE_SUPPORTING_REPORT_CHARS = 12_000;
const SUPPORTING_REPORT_FETCH_CONCURRENCY = 6;

type RewriteDebugLogInput = Parameters<typeof recordPipelineRewriteDebugLog>[1];

function pipelineSourceOrigin(
  article: PipelineArticleView,
  source: SourceSnapshot,
): PipelineRewriteSourceOrigin {
  if (article.sourceText?.trim()) return "saved_scraper";
  const preview = article.description?.trim();
  return preview && source.primaryText.trim() === preview ? "rss_preview" : "live_page";
}

async function safelyRecordRewriteDebugLog(
  database: D1Database,
  input: RewriteDebugLogInput,
) {
  try {
    return await recordPipelineRewriteDebugLog(database, input);
  } catch (error) {
    console.error("[pipeline-rewrite-debug] Could not persist rewrite diagnostics.", {
      articleId: input.articleId,
      outcome: input.outcome,
      cause: error instanceof Error ? error.message.slice(0, 500) : "Unknown logging error",
    });
    return null;
  }
}

function supportingReportText(article: PipelineArticleView, sourceText: string, index: number) {
  return formatSupportingReportPrompt(
    article,
    sourceText.slice(0, MAX_SINGLE_SUPPORTING_REPORT_CHARS),
    index,
  );
}

async function sourceWithRelatedReports(
  database: D1Database,
  canonicalArticle: PipelineArticleView,
  relatedArticles: readonly PipelineArticleView[],
) {
  const loadAndCache = async (article: PipelineArticleView) => {
    const resolved = await resolvePipelineArticleSource(article);
    if (resolved.origin === "live_page") {
      try {
        await cachePipelineArticleSourceText(
          database,
          article.id,
          pipelineArticleBodyText(article, resolved.source),
        );
      } catch (error) {
        console.warn("[pipeline-source-cache] Could not save the retrieved article body.", {
          articleId: article.id,
          cause: error instanceof Error ? error.message.slice(0, 300) : "Unknown cache error",
        });
      }
    }
    return resolved.source;
  };
  const primary = await loadAndCache(canonicalArticle);
  if (relatedArticles.length === 0) return primary;

  const supportingReportChunks: string[] = [];
  for (
    let offset = 0;
    offset < relatedArticles.length;
    offset += SUPPORTING_REPORT_FETCH_CONCURRENCY
  ) {
    const batch = relatedArticles.slice(
      offset,
      offset + SUPPORTING_REPORT_FETCH_CONCURRENCY,
    );
    const snapshots = await Promise.all(
      batch.map(async (article, index) => {
        try {
          const source = await loadAndCache(article);
          return supportingReportText(article, source.primaryText, offset + index + 1);
        } catch {
          // Saved scraper content normally makes this unnecessary. If a single
          // source URL can no longer be retrieved, retain the other reports so a
          // temporary upstream outage does not block the whole top-five batch.
          return null;
        }
      }),
    );
    supportingReportChunks.push(...snapshots.filter((item): item is string => Boolean(item)));
    if (supportingReportChunks.join("\n\n---\n\n").length >= MAX_SUPPORTING_REPORT_CHARS) {
      break;
    }
  }
  const supportingReports = supportingReportChunks
    .join("\n\n---\n\n")
    .slice(0, MAX_SUPPORTING_REPORT_CHARS);
  const linkedText = [primary.linkedText, supportingReports].filter(Boolean).join("\n\n---\n\n");

  return sourceSnapshotSchema.parse({
    ...primary,
    ...(linkedText ? { linkedText } : {}),
  });
}

export async function POST(request: Request, context: RouteContext) {
  const startedAt = Date.now();
  let debugDatabase: D1Database | null = null;
  let debugUserId: string | null = null;
  let debugArticle: PipelineArticleView | null = null;
  let debugInput: PipelineRewriteRequest | null = null;
  let debugSource: SourceSnapshot | null = null;
  let debugSourceOrigin: PipelineRewriteSourceOrigin | null = null;
  let debugEffectiveLengthOption: RewriteLengthOption | null = null;
  let debugRelatedReportCount = 1;
  try {
    const session = await requireApiSession(request, ["client", "employee"], { csrf: true });
    debugUserId = session.user.id;
    const { id } = await context.params;
    const input = pipelineRewriteInputSchema.parse(await readJsonRequest(request));
    debugInput = input;
    const database = getDatabase();
    debugDatabase = database;
    const article = await getPipelineArticleById(database, id);
    if (!article) {
      throw new AppError("ARTICLE_NOT_FOUND", "The article was not found.", 404);
    }
    debugArticle = article;
    debugEffectiveLengthOption = input.lengthOption ?? null;
    debugRelatedReportCount = new Set([article.id, ...input.relatedArticleIds]).size;
    const priorSuccessfulRequest = input.debugBatchId
      ? await getPipelineRewriteCommit(database, {
          batchId: input.debugBatchId,
          articleId: article.id,
          requestedByUserId: session.user.id,
        })
      : null;
    if (
      priorSuccessfulRequest?.validationStatus &&
      priorSuccessfulRequest.attempts &&
      article.rewrittenText?.trim() &&
      article.status !== "new" &&
      priorSuccessfulRequest.requestedModel ===
        (input.model ?? DEFAULT_SELECTABLE_MODEL) &&
      priorSuccessfulRequest.outputLanguage ===
        (input.outputLanguage ?? DEFAULT_REWRITE_OUTPUT_LANGUAGE) &&
      priorSuccessfulRequest.requestedLengthOption === (input.lengthOption ?? null) &&
      priorSuccessfulRequest.relatedReportCount === debugRelatedReportCount
    ) {
      // The original request committed and logged successfully, but its HTTP
      // response may have been lost. The batch ID makes a retry idempotent: do
      // not charge another model request or reject the now-rewritten article.
      return jsonResponse({
        article,
        finalText: article.rewrittenText,
        validation: {
          status: priorSuccessfulRequest.validationStatus,
          attempts: priorSuccessfulRequest.attempts,
        },
      });
    }
    if (article.mergedIntoArticleId) {
      throw new AppError(
        "ARTICLE_ALREADY_MERGED",
        "This duplicate report has already been combined into another pipeline story.",
        409,
      );
    }
    if (input.relatedArticleIds.length > 0 && article.status !== "new") {
      throw new AppError(
        "ARTICLE_REWRITE_CONFLICT",
        "This story changed after the Top 5 batch was prepared. Refresh the pipeline and try again.",
        409,
        { publicDetails: { retryable: true } },
      );
    }

    const requestedRelatedIds = [
      ...new Set(input.relatedArticleIds.filter((relatedId) => relatedId !== article.id)),
    ];
    const requestedRelatedArticles = await getPipelineArticlesByIds(
      database,
      requestedRelatedIds,
    );
    const eligibleRelatedArticles = requestedRelatedArticles.filter(
      (relatedArticle) =>
        relatedArticle.status === "new" &&
        !relatedArticle.mergedIntoArticleId &&
        relatedArticle.id !== article.id,
    );
    if (
      requestedRelatedArticles.length !== requestedRelatedIds.length ||
      eligibleRelatedArticles.length !== requestedRelatedArticles.length
    ) {
      throw new AppError(
        "RELATED_ARTICLE_STATE_CONFLICT",
        "One or more related reports changed after the story cluster was selected. Refresh the pipeline before rewriting.",
        409,
        { publicDetails: { retryable: true } },
      );
    }
    const relatedArticles = connectedStoryArticles(article, eligibleRelatedArticles);
    if (relatedArticles.length !== eligibleRelatedArticles.length) {
      throw new AppError(
        "RELATED_ARTICLE_CLUSTER_MISMATCH",
        "One or more related reports no longer belong to the canonical story cluster. Refresh the pipeline before rewriting.",
        409,
        { publicDetails: { retryable: true } },
      );
    }
    debugRelatedReportCount = relatedArticles.length + 1;
    await recordAgentRequestAttempt(session.user.id, "rewrite");

    const source = await sourceWithRelatedReports(database, article, relatedArticles);
    debugSource = source;
    debugSourceOrigin = pipelineSourceOrigin(article, source);
    const sourceSupportsDetail = pipelineSourceSupportsDetailedRewrite(source);
    const lengthOption =
      input.lengthOption === "more_detailed" && !sourceSupportsDetail
        ? null
        : input.lengthOption ?? null;
    debugEffectiveLengthOption = lengthOption;
    const rewriteContext: RewriteContext = rewriteContextSchema.parse({
      history: [],
      refinement: {
        lengthOption,
        instruction: [
          input.instruction,
          relatedArticles.length > 0
            ? COMBINED_PIPELINE_REWRITE_INSTRUCTION
            : "",
          PIPELINE_REWRITE_FIDELITY_INSTRUCTION,
          input.lengthOption === "more_detailed" && !sourceSupportsDetail
            ? SPARSE_PIPELINE_SOURCE_INSTRUCTION
            : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
      outputLanguage: input.outputLanguage ?? DEFAULT_REWRITE_OUTPUT_LANGUAGE,
      // Scraped pages can contain publisher chrome, so mandatory coverage is
      // bounded by the canonical title. The full saved source still supplies
      // evidence and lengthOption independently controls article depth.
      relaxedFidelity: true,
    });
    const rewrite = await rewriteWithFeedback(
      source,
      null,
      undefined,
      rewriteContext,
      input.model,
    );
    const commit = await commitPipelineArticleRewrite(database, {
      batchId: input.debugBatchId ?? null,
      articleId: article.id,
      rewrittenText: rewrite.finalText,
      status: input.publish ? "approved" : "rewritten",
      precondition: {
        status: article.status,
        updatedAt: article.updatedAt,
        rewrittenText: article.rewrittenText,
      },
      relatedArticleIds: relatedArticles.map((relatedArticle) => relatedArticle.id),
      requestedByUserId: session.user.id,
      requestedModel: input.model ?? DEFAULT_SELECTABLE_MODEL,
      outputLanguage: input.outputLanguage ?? DEFAULT_REWRITE_OUTPUT_LANGUAGE,
      requestedLengthOption: input.lengthOption ?? null,
      relatedReportCount: relatedArticles.length + 1,
      validationStatus: rewrite.validation.status,
      attempts: rewrite.validation.attempts,
    });
    if (!commit.committed) {
      throw new AppError(
        "ARTICLE_REWRITE_CONFLICT",
        "This article changed while it was being rewritten. Refresh the pipeline and try again.",
        409,
      );
    }
    const updatedArticle = await getPipelineArticleById(database, article.id);

    await safelyRecordRewriteDebugLog(database, {
      batchId: input.debugBatchId ?? null,
      articleId: article.id,
      articleTitle: article.title,
      requestedByUserId: session.user.id,
      requestedModel: input.model ?? DEFAULT_SELECTABLE_MODEL,
      outputLanguage: input.outputLanguage ?? DEFAULT_REWRITE_OUTPUT_LANGUAGE,
      requestedLengthOption: input.lengthOption ?? null,
      effectiveLengthOption: lengthOption,
      relatedReportCount: relatedArticles.length + 1,
      sourceOrigin: debugSourceOrigin,
      sourceCharacters: source.primaryText.length,
      linkedCharacters: source.linkedText?.length ?? null,
      outcome: "success",
      validationStatus: rewrite.validation.status,
      attempts: rewrite.validation.attempts,
      durationMs: Date.now() - startedAt,
    });

    return jsonResponse({
      article: updatedArticle,
      finalText: rewrite.finalText,
      validation: rewrite.validation,
    });
  } catch (error) {
    const debugId =
      debugDatabase && debugUserId && debugArticle && debugInput
        ? await safelyRecordRewriteDebugLog(debugDatabase, {
            batchId: debugInput.debugBatchId ?? null,
            articleId: debugArticle.id,
            articleTitle: debugArticle.title,
            requestedByUserId: debugUserId,
            requestedModel: debugInput.model ?? DEFAULT_SELECTABLE_MODEL,
            outputLanguage:
              debugInput.outputLanguage ?? DEFAULT_REWRITE_OUTPUT_LANGUAGE,
            requestedLengthOption: debugInput.lengthOption ?? null,
            effectiveLengthOption: debugEffectiveLengthOption,
            relatedReportCount: debugRelatedReportCount,
            sourceOrigin: debugSourceOrigin,
            sourceCharacters: debugSource?.primaryText.length ?? null,
            linkedCharacters: debugSource?.linkedText?.length ?? null,
            outcome: "failure",
            ...rewriteDebugFailureFields(error),
            durationMs: Date.now() - startedAt,
          })
        : null;
    return errorResponse(error, debugId ? { debugId } : {});
  }
}
