import { getDatabase } from "@/lib/server/auth/database";
import { requireApiSession } from "@/lib/server/auth/guards";
import { authErrorResponse } from "@/lib/server/auth/http";
import { fetchAndIngestFeed } from "@/lib/server/feeds/pipeline";
import { getFeedById } from "@/lib/server/feeds/repository";
import { jsonResponse } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
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
    const result = await fetchAndIngestFeed(getDatabase(), feed);
    return jsonResponse({ result });
  } catch (error) {
    return authErrorResponse(error, {
      operation: "feeds.fetch",
      request,
    });
  }
}
