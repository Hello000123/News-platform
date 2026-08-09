import { getDatabase } from "@/lib/server/auth/database";
import { requireApiSession } from "@/lib/server/auth/guards";
import { authErrorResponse } from "@/lib/server/auth/http";
import { getEmployeeClientDetail } from "@/lib/server/client-summaries";
import { AppError } from "@/lib/server/errors";
import { jsonResponse } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function positiveIntegerParameter(
  searchParams: URLSearchParams,
  name: string,
) {
  const rawValue = searchParams.get(name);
  if (rawValue === null) return undefined;
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value <= 0) {
    throw new AppError(
      "INVALID_PAGINATION",
      "Choose a valid positive page and page size.",
      400,
    );
  }
  return value;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    await requireApiSession(request, ["employee"]);
    const { id } = await context.params;
    const searchParams = new URL(request.url).searchParams;
    const detail = await getEmployeeClientDetail(getDatabase(), id, {
      page: positiveIntegerParameter(searchParams, "page"),
      pageSize: positiveIntegerParameter(searchParams, "pageSize"),
    });
    return jsonResponse({ detail });
  } catch (error) {
    return authErrorResponse(error, {
      operation: "employee.clients.detail",
      request,
    });
  }
}
