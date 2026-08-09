import { getDatabase } from "@/lib/server/auth/database";
import { requireApiSession } from "@/lib/server/auth/guards";
import { authErrorResponse } from "@/lib/server/auth/http";
import { getClientOverview } from "@/lib/server/client-overview";
import { jsonResponse } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireApiSession(request, ["employee"]);
    const overview = await getClientOverview(getDatabase());
    return jsonResponse({ overview });
  } catch (error) {
    return authErrorResponse(error, {
      operation: "employee.client-overview.read",
      request,
    });
  }
}
