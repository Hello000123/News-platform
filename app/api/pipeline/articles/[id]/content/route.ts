import { getDatabase } from "@/lib/server/auth/database";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getPipelineArticleById } from "@/lib/server/feeds/repository";
import { loadArticleContent } from "@/lib/server/feeds/scraper";
import { errorResponse, jsonResponse } from "@/lib/server/http";
import { AppError } from "@/lib/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    await requireApiSession(request, ["client", "employee"]);
    const { id } = await context.params;
    const article = await getPipelineArticleById(getDatabase(), id);
    if (!article) {
      throw new AppError("ARTICLE_NOT_FOUND", "The article was not found.", 404);
    }
    const source = await loadArticleContent(article.url);
    const content = [
      source.linkedTitle ? `[Article title]\n${source.linkedTitle}` : "",
      source.primaryText,
    ]
      .filter(Boolean)
      .join("\n\n");
    return jsonResponse({ article, content });
  } catch (error) {
    return errorResponse(error);
  }
}
