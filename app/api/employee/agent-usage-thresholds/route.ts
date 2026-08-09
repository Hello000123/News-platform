import { nowInSeconds } from "@/lib/server/auth/crypto";
import { getDatabase } from "@/lib/server/auth/database";
import { requireApiSession } from "@/lib/server/auth/guards";
import { authErrorResponse } from "@/lib/server/auth/http";
import {
  listAgentUsageThresholds,
  updateAgentUsageThresholds,
} from "@/lib/server/auth/usage-thresholds";
import { jsonResponse, readJsonRequest } from "@/lib/server/http";
import { agentUsageThresholdUpdateSchema } from "@/lib/shared/auth-contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireApiSession(request, ["employee"]);
    const rules = await listAgentUsageThresholds(getDatabase());
    return jsonResponse({ rules });
  } catch (error) {
    return authErrorResponse(error, {
      operation: "employee.agent-usage-thresholds.get",
      request,
    });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireApiSession(request, ["employee"], {
      csrf: true,
    });
    const input = agentUsageThresholdUpdateSchema.parse(
      await readJsonRequest(request),
    );
    const rules = await updateAgentUsageThresholds(
      getDatabase(),
      input,
      session.user.id,
      nowInSeconds(),
    );
    return jsonResponse({ rules });
  } catch (error) {
    return authErrorResponse(error, {
      operation: "employee.agent-usage-thresholds.update",
      request,
    });
  }
}
