import { categoryPresentationSource } from "@/components/news/category-page-content";
import {
  buildHomepageView,
  homepagePresentationSource,
} from "@/components/news/homepage-content";
import { getDatabase } from "@/lib/server/auth/database";
import { requireApiSession } from "@/lib/server/auth/guards";
import { authErrorResponse } from "@/lib/server/auth/http";
import { AppError } from "@/lib/server/errors";
import {
  listPublicArticles,
  listPublicArticlesByCategory,
} from "@/lib/server/feeds/repository";
import { jsonResponse, readJsonRequest } from "@/lib/server/http";
import {
  getPublicPagePresentationState,
  publishPublicPagePresentation,
  savePublicPagePresentationDraft,
} from "@/lib/server/public-page-presentation";
import {
  articlePresentationFingerprint,
  articlePresentationUpdateSchema,
} from "@/lib/shared/article-presentation";
import {
  PUBLIC_PAGE_PRESENTATION_KEYS,
  type PublicPagePresentationKey,
} from "@/lib/shared/public-page-presentation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ key: string }>;
}

function publicPageKey(value: string): PublicPagePresentationKey {
  if (!(PUBLIC_PAGE_PRESENTATION_KEYS as readonly string[]).includes(value)) {
    throw new AppError("PUBLIC_PAGE_NOT_FOUND", "The public page was not found.", 404);
  }
  return value as PublicPagePresentationKey;
}

async function publicPageSource(
  database: ReturnType<typeof getDatabase>,
  key: PublicPagePresentationKey,
) {
  if (key === "homepage") {
    return homepagePresentationSource(
      buildHomepageView(await listPublicArticles(database, 100)),
    );
  }
  return categoryPresentationSource(
    await listPublicArticlesByCategory(database, key, 100),
    key,
  );
}

async function employeePublicPage(
  request: Request,
  context: RouteContext,
  options: { csrf?: boolean } = {},
) {
  const session = await requireApiSession(request, ["employee"], options);
  const { key: rawKey } = await context.params;
  const key = publicPageKey(rawKey);
  const database = getDatabase();
  const source = await publicPageSource(database, key);
  return { session, database, source };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { database, source } = await employeePublicPage(request, context);
    return jsonResponse(await getPublicPagePresentationState(database, source));
  } catch (error) {
    return authErrorResponse(error, {
      operation: "employee.public-page-presentation.get",
      request,
    });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { session, database, source } = await employeePublicPage(
      request,
      context,
      { csrf: true },
    );
    const input = articlePresentationUpdateSchema.parse(
      await readJsonRequest(request),
    );
    if (input.action === "save") {
      const current = await getPublicPagePresentationState(database, source);
      const saved = await savePublicPagePresentationDraft(
        database,
        source,
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

    const published = await publishPublicPagePresentation(
      database,
      source,
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
      operation: "employee.public-page-presentation.update",
      request,
    });
  }
}
