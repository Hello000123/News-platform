import { getDatabase } from "@/lib/server/auth/database";
import { requireApiSession } from "@/lib/server/auth/guards";
import { authErrorResponse } from "@/lib/server/auth/http";
import { generateClientCompanySummary } from "@/lib/server/client-summaries";
import { jsonResponse } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requireApiSession(request, ["employee"], { csrf: true });
    const { id } = await context.params;
    const summary = await generateClientCompanySummary(
      getDatabase(),
      id,
      session.user,
    );
    return jsonResponse({ summary });
  } catch (error) {
    return authErrorResponse(error, {
      operation: "employee.clients.summary.generate",
      request,
    });
  }
}
