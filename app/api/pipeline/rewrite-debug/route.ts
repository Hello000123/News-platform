import { getDatabase } from "@/lib/server/auth/database";
import { requireApiSession } from "@/lib/server/auth/guards";
import { listPipelineRewriteDebugLogs } from "@/lib/server/feeds/rewrite-debug";
import { errorResponse, jsonResponse } from "@/lib/server/http";
import { pipelineRewriteDebugListResponseSchema } from "@/lib/shared/feeds-contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await requireApiSession(request, ["client", "employee"]);
    const requestedLimit = Number(new URL(request.url).searchParams.get("limit") ?? 50);
    const limit = Number.isFinite(requestedLimit) ? requestedLimit : 50;
    const logs = await listPipelineRewriteDebugLogs(getDatabase(), {
      limit,
      requestedByUserId: session.user.role === "employee" ? undefined : session.user.id,
    });
    return jsonResponse(pipelineRewriteDebugListResponseSchema.parse({ logs }));
  } catch (error) {
    return errorResponse(error);
  }
}
