import type { D1Database } from "@cloudflare/workers-types";

import { createId, nowInSeconds } from "@/lib/server/auth/crypto";
import { AppError } from "@/lib/server/errors";
import {
  AGENT_SUSPENSION_PERIODS,
  isAgentSuspensionPeriod,
} from "@/lib/shared/agent-usage";
import type {
  AgentUsageThresholdRuleView,
  AgentUsageThresholdUpdateInput,
} from "@/lib/shared/auth-contracts";

interface AgentUsageThresholdRow {
  period: string;
  enabled: number;
  request_limit: number;
  suspension_duration_seconds: number;
  updated_at: number;
  updated_by_user_id: string | null;
  updated_by_full_name: string | null;
  updated_by_email: string | null;
}

export async function listAgentUsageThresholds(
  database: D1Database,
): Promise<AgentUsageThresholdRuleView[]> {
  const result = await database
    .prepare(
      `SELECT
         threshold.period,
         threshold.enabled,
         threshold.request_limit,
         threshold.suspension_duration_seconds,
         threshold.updated_at,
         threshold.updated_by_user_id,
         actor.full_name AS updated_by_full_name,
         actor.email AS updated_by_email
       FROM agent_usage_thresholds AS threshold
       LEFT JOIN users AS actor ON actor.id = threshold.updated_by_user_id`,
    )
    .all<AgentUsageThresholdRow>();
  const rowsByPeriod = new Map(
    result.results
      .filter((row) => isAgentSuspensionPeriod(row.period))
      .map((row) => [row.period, row] as const),
  );

  return AGENT_SUSPENSION_PERIODS.map(({ key, label }) => {
    const row = rowsByPeriod.get(key);
    if (!row) {
      throw new AppError(
        "AGENT_USAGE_CONFIGURATION_MISSING",
        "The AI usage suspension configuration is unavailable.",
        503,
      );
    }
    return {
      period: key,
      label,
      enabled: row.enabled === 1,
      threshold: Number(row.request_limit),
      suspensionHours: Number(row.suspension_duration_seconds) / (60 * 60),
      updatedAt: Number(row.updated_at),
      updatedBy:
        row.updated_by_user_id &&
        row.updated_by_full_name &&
        row.updated_by_email
          ? {
              id: row.updated_by_user_id,
              fullName: row.updated_by_full_name,
              email: row.updated_by_email,
            }
          : null,
    };
  });
}

export async function updateAgentUsageThresholds(
  database: D1Database,
  input: AgentUsageThresholdUpdateInput,
  actorUserId: string,
  updatedAt = nowInSeconds(),
) {
  if (!Number.isInteger(updatedAt) || updatedAt < 0) {
    throw new TypeError("Threshold update time must be a non-negative whole Unix timestamp.");
  }
  const actor = await database
    .prepare(
      `SELECT id
       FROM users
       WHERE id = ? AND role = 'employee' AND status = 'active'
       LIMIT 1`,
    )
    .bind(actorUserId)
    .first<{ id: string }>();
  if (!actor) {
    throw new AppError(
      "FORBIDDEN",
      "You do not have permission to change AI usage thresholds.",
      403,
    );
  }

  const rulesByPeriod = new Map(
    input.rules.map((rule) => [rule.period, rule] as const),
  );
  const statements = AGENT_SUSPENSION_PERIODS.flatMap(({ key }) => {
    const rule = rulesByPeriod.get(key);
    if (!rule) {
      throw new AppError(
        "INVALID_AGENT_USAGE_CONFIGURATION",
        "Submit one threshold rule for every supported period.",
        400,
      );
    }
    const enabled = rule.enabled ? 1 : 0;
    const suspensionDurationSeconds = Math.round(
      rule.suspensionHours * 60 * 60,
    );
    return [
      database
        .prepare(
          `INSERT INTO agent_usage_threshold_audit_records (
             id,
             period,
             actor_user_id,
             previous_enabled,
             previous_request_limit,
             previous_suspension_duration_seconds,
             new_enabled,
             new_request_limit,
             new_suspension_duration_seconds,
             created_at
           )
           SELECT ?, period, ?, enabled, request_limit,
                  suspension_duration_seconds, ?, ?, ?, ?
           FROM agent_usage_thresholds
           WHERE period = ?
             AND (
               enabled <> ? OR
               request_limit <> ? OR
               suspension_duration_seconds <> ?
             )`,
        )
        .bind(
          createId(),
          actorUserId,
          enabled,
          rule.threshold,
          suspensionDurationSeconds,
          updatedAt,
          key,
          enabled,
          rule.threshold,
          suspensionDurationSeconds,
        ),
      database
        .prepare(
          `UPDATE agent_usage_thresholds
           SET enabled = ?,
               request_limit = ?,
               suspension_duration_seconds = ?,
               updated_at = ?,
               updated_by_user_id = ?
           WHERE period = ?`,
        )
        .bind(
          enabled,
          rule.threshold,
          suspensionDurationSeconds,
          updatedAt,
          actorUserId,
          key,
        ),
    ];
  });
  await database.batch(statements);
  return listAgentUsageThresholds(database);
}
