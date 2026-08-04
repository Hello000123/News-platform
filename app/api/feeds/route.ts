import { getDatabase } from "@/lib/server/auth/database";
import { requireApiSession } from "@/lib/server/auth/guards";
import { authErrorResponse } from "@/lib/server/auth/http";
import { createFeed, listFeeds } from "@/lib/server/feeds/repository";
import { jsonResponse, readJsonRequest } from "@/lib/server/http";
import { feedInputSchema } from "@/lib/shared/feeds-contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireApiSession(request, ["employee"]);
    const feeds = await listFeeds(getDatabase());
    return jsonResponse({ feeds });
  } catch (error) {
    return authErrorResponse(error, {
      operation: "feeds.list",
      request,
    });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(request, ["employee"], { csrf: true });
    const input = feedInputSchema.parse(await readJsonRequest(request));
    const feed = await createFeed(getDatabase(), input, session.user.id);
    return jsonResponse({ feed }, 201);
  } catch (error) {
    return authErrorResponse(error, {
      operation: "feeds.create",
      request,
    });
  }
}
