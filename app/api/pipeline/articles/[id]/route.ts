import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/auth/database";
import { AppError } from "@/lib/server/errors";
import {
  getPipelineArticleById,
  updatePipelineArticleStatus,
} from "@/lib/server/feeds/repository";
import { errorResponse, jsonResponse, readJsonRequest } from "@/lib/server/http";
import { pipelineStatusUpdateSchema } from "@/lib/shared/feeds-contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireApiSession(request, ["client", "employee"], { csrf: true });
    const { id } = await context.params;
    const input = pipelineStatusUpdateSchema.parse(await readJsonRequest(request));
    const database = getDatabase();
    const article = await getPipelineArticleById(database, id);
    if (!article) {
      throw new AppError("ARTICLE_NOT_FOUND", "The article was not found.", 404);
    }
    await updatePipelineArticleStatus(database, id, input.status);
    const updated = await getPipelineArticleById(database, id);
    return jsonResponse({ article: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
