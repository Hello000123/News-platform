import type { D1Database } from "@cloudflare/workers-types";

import { createId, nowInSeconds } from "@/lib/server/auth/crypto";
import { getDatabase } from "@/lib/server/auth/database";
import {
  resolveAgentUsageWindow,
  type AgentUsagePeriod,
} from "@/lib/shared/agent-usage";
import type { AgentUsagePeriodView } from "@/lib/shared/auth-contracts";

export type AgentRequestKind = "review" | "rewrite";

export async function incrementAgentRequestAttempt(
  database: D1Database,
  userId: string,
  kind: AgentRequestKind,
  attemptedAt = nowInSeconds(),
) {
  if (!Number.isInteger(attemptedAt) || attemptedAt < 0) {
    throw new TypeError("Agent request time must be a non-negative whole Unix timestamp.");
  }
  const reviewIncrement = kind === "review" ? 1 : 0;
  const rewriteIncrement = kind === "rewrite" ? 1 : 0;

  await database.batch([
    database
      .prepare(
        `INSERT INTO agent_request_events (
          id, user_id, request_kind, attempted_at
         ) VALUES (?, ?, ?, ?)`,
      )
      .bind(createId(), userId, kind, attemptedAt),
    database
      .prepare(
        `INSERT INTO agent_request_usage (
          user_id, review_request_count, rewrite_request_count, updated_at
         ) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           review_request_count = review_request_count + excluded.review_request_count,
           rewrite_request_count = rewrite_request_count + excluded.rewrite_request_count,
           updated_at = excluded.updated_at`,
      )
      .bind(userId, reviewIncrement, rewriteIncrement, attemptedAt),
  ]);
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
