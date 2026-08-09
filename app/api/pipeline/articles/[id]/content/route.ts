import { getDatabase } from "@/lib/server/auth/database";
import { requireApiSession } from "@/lib/server/auth/guards";
import {
  cachePipelineArticleSourceText,
  getPipelineArticleById,
} from "@/lib/server/feeds/repository";
import {
  pipelineArticleBodyText,
  resolvePipelineArticleSource,
} from "@/lib/server/feeds/scraper";
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
    const database = getDatabase();
    const article = await getPipelineArticleById(database, id);
    if (!article) {
      throw new AppError("ARTICLE_NOT_FOUND", "The article was not found.", 404);
    }
    const resolved = await resolvePipelineArticleSource(article);
    const bodyText = pipelineArticleBodyText(article, resolved.source);
    let responseArticle = article;
    if (resolved.origin === "live_page") {
      try {
        const cached = await cachePipelineArticleSourceText(database, article.id, bodyText);
        if (cached) {
          responseArticle = (await getPipelineArticleById(database, article.id)) ?? article;
        }
      } catch (error) {
        console.warn("[pipeline-source-cache] Could not save the retrieved article body.", {
          articleId: article.id,
          cause: error instanceof Error ? error.message.slice(0, 300) : "Unknown cache error",
        });
      }
    }
    const content = [
      resolved.source.linkedTitle
        ? `[Article title]\n${resolved.source.linkedTitle}`
        : "",
      bodyText,
    ]
      .filter(Boolean)
      .join("\n\n");
    return jsonResponse({
      article: responseArticle,
      content,
      sourceOrigin: resolved.origin,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
