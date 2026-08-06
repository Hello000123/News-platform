import { rewriteWithFeedback } from "@/lib/server/agents/workflow";
import { getDatabase } from "@/lib/server/auth/database";
import { requireApiSession } from "@/lib/server/auth/guards";
import { recordAgentRequestAttempt } from "@/lib/server/auth/request-usage";
import { AppError } from "@/lib/server/errors";
import {
  getPipelineArticleById,
  getPipelineArticlesByIds,
  markPipelineArticlesMerged,
  setPipelineArticleRewritten,
} from "@/lib/server/feeds/repository";
import { loadArticleContent } from "@/lib/server/feeds/scraper";
import { errorResponse, jsonResponse, readJsonRequest } from "@/lib/server/http";
import {
  rewriteContextSchema,
  sourceSnapshotSchema,
  type RewriteContext,
} from "@/lib/shared/contracts";
import {
  pipelineRewriteInputSchema,
  type PipelineArticleView,
} from "@/lib/shared/feeds-contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const MAX_SUPPORTING_REPORT_CHARS = 50_000;
const MAX_SINGLE_SUPPORTING_REPORT_CHARS = 12_000;

function sourceFromSavedScrape(article: Pick<PipelineArticleView, "title" | "url" | "sourceText">) {
  const text = article.sourceText?.trim();
  if (!text) return null;
  return sourceSnapshotSchema.parse({
    primaryText: text.slice(0, 50_000),
    userDraft: "",
    sourceUrl: article.url,
    linkedTitle: article.title,
    imageContext: [],
  });
}

async function sourceForArticle(article: PipelineArticleView) {
  return sourceFromSavedScrape(article) ?? loadArticleContent(article.url);
}

function supportingReportText(article: PipelineArticleView, sourceText: string, index: number) {
  return [
    `RELATED REPORT ${index} — ${article.feedName}`,
    `Headline: ${article.title}`,
    `Source URL: ${article.url}`,
    sourceText.slice(0, MAX_SINGLE_SUPPORTING_REPORT_CHARS),
  ].join("\n");
}

async function sourceWithRelatedReports(
  canonicalArticle: PipelineArticleView,
  relatedArticles: readonly PipelineArticleView[],
) {
  const primary = await sourceForArticle(canonicalArticle);
  if (relatedArticles.length === 0) return primary;

  const relatedSnapshots = await Promise.all(
    relatedArticles.map(async (article) => {
      try {
        return { article, source: await sourceForArticle(article) };
      } catch {
        // Saved scraper content normally makes this unnecessary. If a single
        // source URL can no longer be retrieved, retain the other reports so a
        // temporary upstream outage does not block the whole top-five batch.
        return null;
      }
    }),
  );
  const supportingReports = relatedSnapshots
    .flatMap((item, index) =>
      item ? [supportingReportText(item.article, item.source.primaryText, index + 1)] : [],
    )
    .join("\n\n---\n\n")
    .slice(0, MAX_SUPPORTING_REPORT_CHARS);
  const linkedText = [primary.linkedText, supportingReports].filter(Boolean).join("\n\n---\n\n");

  return sourceSnapshotSchema.parse({
    ...primary,
    ...(linkedText ? { linkedText } : {}),
  });
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requireApiSession(request, ["client", "employee"], { csrf: true });
    const { id } = await context.params;
    const input = pipelineRewriteInputSchema.parse(await readJsonRequest(request));
    const database = getDatabase();
    const article = await getPipelineArticleById(database, id);
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

    const requestedRelatedIds = input.relatedArticleIds.filter((relatedId) => relatedId !== article.id);
    const relatedArticles = (await getPipelineArticlesByIds(database, requestedRelatedIds)).filter(
      (relatedArticle) =>
        relatedArticle.status === "new" &&
        !relatedArticle.mergedIntoArticleId &&
        relatedArticle.id !== article.id,
    );
    await recordAgentRequestAttempt(session.user.id, "rewrite");

    const source = await sourceWithRelatedReports(article, relatedArticles);
    const rewriteContext: RewriteContext = rewriteContextSchema.parse({
      history: [],
      refinement: {
        lengthOption: input.lengthOption ?? null,
        instruction: [
          input.instruction,
          relatedArticles.length > 0
            ? "This is a combined news brief. Use the labelled related reports as corroborating source material, retain only facts that are explicit and consistent across the available sources, and do not repeat the same detail or turn supporting-report quotations into new direct quotations."
            : "",
          "Keep the primary article's headline facts, named people, brand and model names, and key figures exact. A concise brief may compress non-essential body detail, but never change, omit, or invent a name, number, date, or quotation that the brief includes.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
      outputLanguage: input.outputLanguage ?? "source",
      // The top-five batch produces summary briefs for editorial review, so
      // verbatim-fidelity checks apply to the source lead only. Anti-fabrication
      // checks (invented numbers or quotations) remain strict against the full
      // article and related reports.
      relaxedFidelity: true,
    });
    const rewrite = await rewriteWithFeedback(
      source,
      null,
      undefined,
      rewriteContext,
      input.model,
    );
    const rewritten = await setPipelineArticleRewritten(database, article.id, rewrite.finalText);
    if (!rewritten) {
      throw new AppError(
        "ARTICLE_REWRITE_CONFLICT",
        "This article changed while it was being rewritten. Refresh the pipeline and try again.",
        409,
      );
    }
    await markPipelineArticlesMerged(
      database,
      article.id,
      relatedArticles.map((relatedArticle) => relatedArticle.id),
    );
    const updatedArticle = await getPipelineArticleById(database, article.id);

    return jsonResponse({
      article: updatedArticle,
      finalText: rewrite.finalText,
      validation: rewrite.validation,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
