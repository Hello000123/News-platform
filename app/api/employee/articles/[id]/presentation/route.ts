import {
  getArticlePresentationState,
  publishArticlePresentation,
  saveArticlePresentationDraft,
} from "@/lib/server/article-presentation";
import { getDatabase } from "@/lib/server/auth/database";
import { requireApiSession } from "@/lib/server/auth/guards";
import { authErrorResponse } from "@/lib/server/auth/http";
import { AppError } from "@/lib/server/errors";
import { getPipelineArticleById } from "@/lib/server/feeds/repository";
import { jsonResponse, readJsonRequest } from "@/lib/server/http";
import {
  articlePresentationFingerprint,
  articlePresentationUpdateSchema,
} from "@/lib/shared/article-presentation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function employeeArticle(
  request: Request,
  context: RouteContext,
  options: { csrf?: boolean } = {},
) {
  const session = await requireApiSession(request, ["employee"], options);
  const { id } = await context.params;
  const database = getDatabase();
  const article = await getPipelineArticleById(database, id);
  if (!article || article.mergedIntoArticleId) {
    throw new AppError("ARTICLE_NOT_FOUND", "The article was not found.", 404);
  }
  return { session, database, article };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { database, article } = await employeeArticle(request, context);
    const presentation = await getArticlePresentationState(database, article);
    return jsonResponse({ article, ...presentation });
  } catch (error) {
    return authErrorResponse(error, {
      operation: "employee.article-presentation.get",
      request,
    });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { session, database, article } = await employeeArticle(
      request,
      context,
      { csrf: true },
    );
    const input = articlePresentationUpdateSchema.parse(
      await readJsonRequest(request),
    );
    if (input.action === "save") {
      const current = await getArticlePresentationState(database, article);
      const saved = await saveArticlePresentationDraft(
        database,
        article,
        input.presentation,
        session.user.id,
      );
      return jsonResponse({
        presentation: saved.presentation,
        savedAt: saved.savedAt,
        publishedAt: current.publishedAt,
        hasUnpublishedChanges:
          articlePresentationFingerprint(saved.presentation) !==
          articlePresentationFingerprint(current.published),
      });
    }

    const published = await publishArticlePresentation(
      database,
      article,
      input.presentation,
      session.user.id,
    );
    return jsonResponse({
      presentation: published.presentation,
      savedAt: published.publishedAt,
      publishedAt: published.publishedAt,
      hasUnpublishedChanges: false,
    });
  } catch (error) {
    return authErrorResponse(error, {
      operation: "employee.article-presentation.update",
      request,
    });
  }
}
