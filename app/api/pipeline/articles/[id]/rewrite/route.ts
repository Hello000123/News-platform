import { rewriteWithFeedback } from "@/lib/server/agents/workflow";
import { getDatabase } from "@/lib/server/auth/database";
import { requireApiSession } from "@/lib/server/auth/guards";
import { recordAgentRequestAttempt } from "@/lib/server/auth/request-usage";
import { AppError } from "@/lib/server/errors";
import { getPipelineArticleById, setPipelineArticleRewritten } from "@/lib/server/feeds/repository";
import { loadArticleContent } from "@/lib/server/feeds/scraper";
import { errorResponse, jsonResponse, readJsonRequest } from "@/lib/server/http";
import {
  rewriteContextSchema,
  type RewriteContext,
} from "@/lib/shared/contracts";import { pipelineRewriteInputSchema } from "@/lib/shared/feeds-contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
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
    await recordAgentRequestAttempt(session.user.id, "rewrite");

    const source = await loadArticleContent(article.url);
    const rewriteContext: RewriteContext = rewriteContextSchema.parse({
      history: [],
      refinement: {
        lengthOption: input.lengthOption ?? null,
        instruction: input.instruction,
      },
    });
    const rewrite = await rewriteWithFeedback(
      source,
      null,
      undefined,
      rewriteContext,
      input.model,
    );
    await setPipelineArticleRewritten(database, article.id, rewrite.finalText);
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
