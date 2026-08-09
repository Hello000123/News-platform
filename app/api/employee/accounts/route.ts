import { getDatabase } from "@/lib/server/auth/database";
import { nowInSeconds } from "@/lib/server/auth/crypto";
import { requireApiSession } from "@/lib/server/auth/guards";
import { authErrorResponse } from "@/lib/server/auth/http";
import { describeAgentUsagePeriod } from "@/lib/server/auth/request-usage";
import {
  getAccountRoleSummary,
  listUserAccounts,
} from "@/lib/server/auth/repository";
import { AppError } from "@/lib/server/errors";
import { jsonResponse } from "@/lib/server/http";
import {
  DEFAULT_AGENT_USAGE_PERIOD,
  isAgentUsagePeriod,
} from "@/lib/shared/agent-usage";
import { USER_ROLES, type UserRole } from "@/lib/shared/auth-contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireApiSession(request, ["employee"]);
    const searchParams = new URL(request.url).searchParams;
    const rawRole = searchParams.get("role");
    if (!rawRole || !USER_ROLES.includes(rawRole as UserRole)) {
      throw new AppError(
        "INVALID_ACCOUNT_ROLE",
        "Choose either client or employee accounts.",
        400,
      );
    }

    const role = rawRole as UserRole;
    const rawUsagePeriod =
      searchParams.get("usagePeriod") ?? DEFAULT_AGENT_USAGE_PERIOD;
    if (!isAgentUsagePeriod(rawUsagePeriod)) {
      throw new AppError(
        "INVALID_USAGE_PERIOD",
        "Choose a supported AI usage period.",
        400,
      );
    }
    const database = getDatabase();
    const nowSeconds = nowInSeconds();
    const [accounts, summary, usagePeriod] = await Promise.all([
      listUserAccounts(database, role, {
        usagePeriod: rawUsagePeriod,
        nowSeconds,
      }),
      getAccountRoleSummary(database),
      describeAgentUsagePeriod(database, rawUsagePeriod, nowSeconds),
    ]);
    return jsonResponse({ accounts, summary, usagePeriod });
  } catch (error) {
    return authErrorResponse(error, {
      operation: "employee.accounts.list",
      request,
    });
  }
}
