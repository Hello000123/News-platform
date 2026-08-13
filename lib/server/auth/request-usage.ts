import type { D1Database } from "@cloudflare/workers-types";

import { createId, nowInSeconds } from "@/lib/server/auth/crypto";
import { getDatabase } from "@/lib/server/auth/database";
import { AppError } from "@/lib/server/errors";
import {
  agentUsagePeriodLabel,
  isAgentSuspensionPeriod,
  resolveAgentUsageWindow,
  type AgentUsagePeriod,
} from "@/lib/shared/agent-usage";
import type { AgentUsagePeriodView } from "@/lib/shared/auth-contracts";

export type AgentRequestKind = "review" | "rewrite";

interface AgentSuspensionRow {
  role: "client" | "employee";
  status: "setup_pending" | "active" | "disabled";
  manual_suspended_at: number | null;
  ai_suspension_id: string | null;
  ai_suspended_at: number | null;
  ai_suspended_until: number | null;
  ai_suspension_period: string | null;
  ai_suspension_threshold: number | null;
  ai_suspension_observed_count: number | null;
}

function formattedSuspensionExpiry(timestamp: number) {
  return new Intl.DateTimeFormat("en-HK", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Hong_Kong",
    timeZoneName: "short",
  }).format(new Date(timestamp * 1_000));
}

function temporarySuspensionError(row: AgentSuspensionRow) {
  const period = row.ai_suspension_period;
  const startedAt = Number(row.ai_suspended_at);
  const expiresAt = Number(row.ai_suspended_until);
  const threshold = Number(row.ai_suspension_threshold);
  const observedCount = Number(row.ai_suspension_observed_count);
  if (
    !row.ai_suspension_id ||
    !isAgentSuspensionPeriod(period) ||
    !Number.isInteger(startedAt) ||
    !Number.isInteger(expiresAt) ||
    threshold < 1 ||
    observedCount < 1
  ) {
    throw new AppError(
      "ACCOUNT_TEMPORARILY_SUSPENDED",
      "This account is temporarily suspended.",
      429,
      { publicDetails: { retryable: false } },
    );
  }
  const label = agentUsagePeriodLabel(period);
  throw new AppError(
    "ACCOUNT_TEMPORARILY_SUSPENDED",
    `This account is temporarily suspended because ${observedCount.toLocaleString("en-US")} requests in ${label} exceeded the configured limit of ${threshold.toLocaleString("en-US")}. Account access resumes at ${formattedSuspensionExpiry(expiresAt)}.`,
    429,
    {
      publicDetails: {
        retryable: false,
        suspensionStartedAt: startedAt,
        suspensionExpiresAt: expiresAt,
        suspensionPeriod: period,
        suspensionThreshold: threshold,
        suspensionObservedCount: observedCount,
      },
    },
  );
}

function accountSuspendedError(): never {
  throw new AppError(
    "ACCOUNT_SUSPENDED",
    "This account has been suspended. Please check your email for details.",
    403,
  );
}

function getAgentSuspensionRow(database: D1Database, userId: string) {
  return database
    .prepare(
      `SELECT
         role,
         status,
         manual_suspended_at,
         ai_suspension_id,
         ai_suspended_at,
         ai_suspended_until,
         ai_suspension_period,
         ai_suspension_threshold,
         ai_suspension_observed_count
       FROM users
       WHERE id = ?
       LIMIT 1`,
    )
    .bind(userId)
    .first<AgentSuspensionRow>();
}

export async function incrementAgentRequestAttempt(
  database: D1Database,
  userId: string,
  kind: AgentRequestKind,
  attemptedAt = nowInSeconds(),
) {
  if (!Number.isInteger(attemptedAt) || attemptedAt < 0) {
    throw new TypeError("Agent request time must be a non-negative whole Unix timestamp.");
  }
  const eventId = createId();
  try {
    await database
      .prepare(
        `INSERT INTO agent_request_events (
           id, user_id, request_kind, attempted_at
         )
         SELECT ?, id, ?, ?
         FROM users
         WHERE id = ? AND status = 'active'`,
      )
      .bind(eventId, kind, attemptedAt, userId)
      .run();
  } catch (error) {
    const activeSuspension = await getAgentSuspensionRow(database, userId);
    if (
      activeSuspension?.role === "client" &&
      activeSuspension.manual_suspended_at !== null
    ) {
      accountSuspendedError();
    }
    if (
      activeSuspension?.role === "client" &&
      Number(activeSuspension.ai_suspended_until ?? 0) > attemptedAt
    ) {
      temporarySuspensionError(activeSuspension);
    }
    throw error;
  }

  const suspension = await getAgentSuspensionRow(database, userId);
  if (!suspension || suspension.status !== "active") {
    throw new AppError("AUTH_REQUIRED", "Sign in to continue.", 401);
  }
  if (suspension.role === "client" && suspension.manual_suspended_at !== null) {
    accountSuspendedError();
  }
  if (
    suspension.role === "client" &&
    suspension.ai_suspension_id === eventId &&
    Number(suspension.ai_suspended_until ?? 0) > attemptedAt
  ) {
    temporarySuspensionError(suspension);
  }
}

export function recordAgentRequestAttempt(userId: string, kind: AgentRequestKind) {
  return incrementAgentRequestAttempt(getDatabase(), userId, kind);
}

export async function describeAgentUsagePeriod(
  database: D1Database,
  period: AgentUsagePeriod,
  nowSeconds = nowInSeconds(),
): Promise<AgentUsagePeriodView> {
  const window = resolveAgentUsageWindow(period, nowSeconds);
  const tracking = await database
    .prepare(
      `SELECT started_at
       FROM agent_request_event_tracking
       WHERE singleton_id = 1`,
    )
    .first<{ started_at: number }>();
  const trackingStartedAt = Number(tracking?.started_at ?? nowSeconds);
  return {
    ...window,
    trackingStartedAt,
    isComplete:
      period === "lifetime" ||
      (window.startAt !== null && window.startAt >= trackingStartedAt),
  };
}
