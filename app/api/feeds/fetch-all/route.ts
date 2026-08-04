import { getDatabase } from "@/lib/server/auth/database";
import { requireApiSession } from "@/lib/server/auth/guards";
import { authErrorResponse } from "@/lib/server/auth/http";
import { ingestAllFeeds } from "@/lib/server/feeds/pipeline";
import { jsonResponse } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireApiSession(request, ["employee"], { csrf: true });
    const result = await ingestAllFeeds(getDatabase());
    return jsonResponse({
      feeds: result.feeds,
      totalParsed: result.totalParsed,
      totalAdded: result.totalAdded,
      failedCount: result.failedCount,
    });
  } catch (error) {
    return authErrorResponse(error, {
      operation: "feeds.fetch-all",
      request,
    });
  }
}
