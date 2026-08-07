import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/auth/database";
import { AppError } from "@/lib/server/errors";
import {
  getPipelineArticleById,
  updatePipelineArticlePost,
} from "@/lib/server/feeds/repository";
import { errorResponse, jsonResponse, readJsonRequest } from "@/lib/server/http";
import { pipelineArticlePostUpdateSchema } from "@/lib/shared/feeds-contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireApiSession(request, ["client", "employee"], { csrf: true });
    const { id } = await context.params;
    const input = pipelineArticlePostUpdateSchema.parse(await readJsonRequest(request));
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
    if (
      input.status === "approved" &&
      !(input.rewrittenText ?? article.rewrittenText)?.trim()
    ) {
      throw new AppError(
        "ARTICLE_NOT_READY_FOR_PUBLICATION",
        "Rewrite or add the final article copy before publishing it to the homepage.",
        409,
      );
    }
    const changed = await updatePipelineArticlePost(database, id, input);
    if (!changed) {
      throw new AppError(
        "ARTICLE_UPDATE_CONFLICT",
        "This article changed while it was being saved. Refresh the pipeline and try again.",
        409,
      );
    }
    const updated = await getPipelineArticleById(database, id);
    return jsonResponse({ article: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
