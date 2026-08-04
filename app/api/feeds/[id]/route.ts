import { getDatabase } from "@/lib/server/auth/database";
import { requireApiSession } from "@/lib/server/auth/guards";
import { authErrorResponse } from "@/lib/server/auth/http";
import { deleteFeed, getFeedById, updateFeed } from "@/lib/server/feeds/repository";
import { jsonResponse, readJsonRequest } from "@/lib/server/http";
import { feedUpdateSchema } from "@/lib/shared/feeds-contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireApiSession(request, ["employee"], { csrf: true });
    const { id } = await context.params;
    const input = feedUpdateSchema.parse(await readJsonRequest(request));
    const feed = await updateFeed(getDatabase(), id, input);
    if (!feed) {
      return jsonResponse(
        { error: { code: "FEED_NOT_FOUND", message: "The feed was not found." } },
        404,
      );
    }
    return jsonResponse({ feed });
  } catch (error) {
    return authErrorResponse(error, {
      operation: "feeds.update",
      request,
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    await requireApiSession(request, ["employee"], { csrf: true });
    const { id } = await context.params;
    const feed = await getFeedById(getDatabase(), id);
    if (!feed) {
      return jsonResponse(
        { error: { code: "FEED_NOT_FOUND", message: "The feed was not found." } },
        404,
      );
    }
    await deleteFeed(getDatabase(), id);
    return jsonResponse({ deleted: true });
  } catch (error) {
    return authErrorResponse(error, {
      operation: "feeds.delete",
      request,
    });
  }
}
