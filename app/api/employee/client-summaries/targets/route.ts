import { getDatabase } from "@/lib/server/auth/database";
import { requireApiSession } from "@/lib/server/auth/guards";
import { authErrorResponse } from "@/lib/server/auth/http";
import { listClientSummaryTargets } from "@/lib/server/client-summaries";
import { jsonResponse } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireApiSession(request, ["employee"]);
    const clients = await listClientSummaryTargets(getDatabase());
    return jsonResponse({ clients });
  } catch (error) {
    return authErrorResponse(error, {
      operation: "employee.clients.summary.targets",
      request,
    });
  }
}
