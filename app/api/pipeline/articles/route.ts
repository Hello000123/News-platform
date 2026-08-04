import { getDatabase } from "@/lib/server/auth/database";
import { requireApiSession } from "@/lib/server/auth/guards";
import { listPipelineArticles } from "@/lib/server/feeds/repository";
import { errorResponse, jsonResponse } from "@/lib/server/http";
import { PIPELINE_ARTICLE_STATUSES } from "@/lib/shared/feeds-contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireApiSession(request, ["client", "employee"]);
    const rawStatus = new URL(request.url).searchParams.get("status");
    const status =
      rawStatus && PIPELINE_ARTICLE_STATUSES.includes(
        rawStatus as (typeof PIPELINE_ARTICLE_STATUSES)[number],
      )
        ? (rawStatus as (typeof PIPELINE_ARTICLE_STATUSES)[number])
        : undefined;
    const articles = await listPipelineArticles(getDatabase(), status);
    return jsonResponse({ articles });
  } catch (error) {
    return errorResponse(error);
  }
}
