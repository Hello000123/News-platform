import { getDatabase } from "@/lib/server/auth/database";
import { requireApiSession } from "@/lib/server/auth/guards";
import { listPopularPipelineStories } from "@/lib/server/feeds/repository";
import { errorResponse, jsonResponse } from "@/lib/server/http";
import { popularPipelineStoriesResponseSchema } from "@/lib/shared/feeds-contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireApiSession(request, ["client", "employee"]);
    const stories = await listPopularPipelineStories(getDatabase(), 5);
    return jsonResponse(popularPipelineStoriesResponseSchema.parse({ stories }));
  } catch (error) {
    return errorResponse(error);
  }
}
