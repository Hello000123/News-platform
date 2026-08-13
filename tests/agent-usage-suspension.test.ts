import { readFile } from "node:fs/promises";

import type { D1Database } from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { listUserAccounts } from "@/lib/server/auth/repository";
import { incrementAgentRequestAttempt } from "@/lib/server/auth/request-usage";

async function executeSqlScript(database: D1Database, sql: string) {
  let pending = "";
  let insideTrigger = false;
  const statements: string[] = [];
  for (const line of sql.replace(/\r/gu, "").split("\n")) {
    if (!insideTrigger && /^\s*CREATE\s+TRIGGER\b/iu.test(line)) {
      insideTrigger = true;
    }
    pending += `${pending ? "\n" : ""}${line}`;
    if (insideTrigger) {
      if (/^\s*END;\s*$/iu.test(line)) {
        statements.push(pending.trim());
        pending = "";
        insideTrigger = false;
      }
      continue;
    }
    let separator = pending.indexOf(";");
    while (separator >= 0) {
      const statement = pending.slice(0, separator).trim();
      if (statement) statements.push(statement);
      pending = pending.slice(separator + 1);
      separator = pending.indexOf(";");
    }
  }
  if (pending.trim()) statements.push(pending.trim());
  for (const statement of statements) await database.prepare(statement).run();
}

describe("automatic AI usage suspension", () => {
  let miniflare: Miniflare;
  let database: D1Database;
  const now = 1_800_000_000;

  beforeEach(async () => {
    miniflare = new Miniflare({
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } };",
      d1Databases: { DB: crypto.randomUUID() },
      cf: false,
    });
    database = (await miniflare.getD1Database("DB")) as D1Database;
    for (const migration of [
      "0001_authentication.sql",
      "0005_agent_request_usage.sql",
      "0016_timestamped_agent_request_events.sql",
      "0017_configurable_agent_usage_suspensions.sql",
      "0020_configurable_agent_suspension_duration.sql",
    ]) {
      await executeSqlScript(
        database,
        await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8"),
      );
    }
    await database
      .prepare(
        `INSERT INTO users (
           id, email, full_name, role, status, created_at, updated_at
         ) VALUES
           ('client-boundary', 'boundary@example.test', 'Boundary Client', 'client', 'active', ?, ?),
           ('client-concurrent', 'concurrent@example.test', 'Concurrent Client', 'client', 'active', ?, ?),
           ('client-overlap', 'overlap@example.test', 'Overlap Client', 'client', 'active', ?, ?),
           ('employee-exempt', 'employee@example.test', 'Employee User', 'employee', 'active', ?, ?)`,
      )
      .bind(now, now, now, now, now, now, now, now)
      .run();
  });

  afterEach(async () => {
    await miniflare.dispose();
  });

  async function configure(
    period: string,
    enabled: boolean,
    threshold: number,
    suspensionHours = 6,
  ) {
    await database
      .prepare(
        `UPDATE agent_usage_thresholds
         SET enabled = ?, request_limit = ?, suspension_duration_seconds = ?,
             updated_at = ?
         WHERE period = ?`,
      )
      .bind(
        enabled ? 1 : 0,
        threshold,
        Math.round(suspensionHours * 60 * 60),
        now,
        period,
      )
      .run();
  }

  it("allows the configured number, suspends on the exceeding attempt, and never extends an active expiry", async () => {
    const suspensionSeconds = 1.25 * 60 * 60;
    await configure("last_15_minutes", true, 3, 1.25);

    await incrementAgentRequestAttempt(database, "client-boundary", "review", now - 3);
    await incrementAgentRequestAttempt(database, "client-boundary", "rewrite", now - 2);
    await incrementAgentRequestAttempt(database, "client-boundary", "review", now - 1);

    await expect(
      incrementAgentRequestAttempt(database, "client-boundary", "rewrite", now),
    ).rejects.toMatchObject({
      code: "ACCOUNT_TEMPORARILY_SUSPENDED",
      status: 429,
      publicDetails: {
        retryable: false,
        suspensionStartedAt: now,
        suspensionExpiresAt: now + suspensionSeconds,
        suspensionPeriod: "last_15_minutes",
        suspensionThreshold: 3,
        suspensionObservedCount: 4,
      },
    });

    const firstSuspension = await database
      .prepare(
        `SELECT
           ai_suspension_id,
           ai_suspended_at,
           ai_suspended_until,
           ai_suspension_period,
           ai_suspension_threshold,
           ai_suspension_observed_count
         FROM users
         WHERE id = 'client-boundary'`,
      )
      .first<Record<string, unknown>>();
    expect(firstSuspension).toMatchObject({
      ai_suspended_at: now,
      ai_suspended_until: now + suspensionSeconds,
      ai_suspension_period: "last_15_minutes",
      ai_suspension_threshold: 3,
      ai_suspension_observed_count: 4,
    });
    const activeAccount = (
      await listUserAccounts(database, "client", { nowSeconds: now })
    ).find(({ id }) => id === "client-boundary");
    expect(activeAccount?.aiSuspension).toMatchObject({
      id: firstSuspension?.ai_suspension_id,
      startedAt: now,
      expiresAt: now + suspensionSeconds,
      triggeredPeriod: "last_15_minutes",
      periodLabel: "Last 15 minutes",
      configuredThreshold: 3,
      observedRequestCount: 4,
    });

    await expect(
      incrementAgentRequestAttempt(database, "client-boundary", "review", now + 1),
    ).rejects.toMatchObject({
      code: "ACCOUNT_TEMPORARILY_SUSPENDED",
      publicDetails: {
        suspensionExpiresAt: now + suspensionSeconds,
      },
    });
    expect(
      await database
        .prepare(
          `SELECT COUNT(*) AS count
           FROM agent_request_events
           WHERE user_id = 'client-boundary'`,
        )
        .first<{ count: number }>(),
    ).toEqual({ count: 4 });
    expect(
      await database
        .prepare(
          `SELECT COUNT(*) AS count
           FROM agent_usage_suspension_audit_records
           WHERE subject_user_id = 'client-boundary'`,
        )
        .first<{ count: number }>(),
    ).toEqual({ count: 1 });

    await expect(
      incrementAgentRequestAttempt(
        database,
        "client-boundary",
        "review",
        now + suspensionSeconds,
      ),
    ).resolves.toBeUndefined();
    const accounts = await listUserAccounts(database, "client", {
      nowSeconds: now + suspensionSeconds,
    });
    expect(accounts.find(({ id }) => id === "client-boundary")?.aiSuspension).toBeNull();
  });

  it("leaves disabled rules inactive and exempts employee accounts", async () => {
    await configure("last_15_minutes", false, 1);
    await incrementAgentRequestAttempt(database, "client-boundary", "review", now);
    await incrementAgentRequestAttempt(database, "client-boundary", "rewrite", now + 1);

    await configure("last_15_minutes", true, 1);
    await incrementAgentRequestAttempt(database, "employee-exempt", "review", now);
    await incrementAgentRequestAttempt(database, "employee-exempt", "rewrite", now + 1);

    expect(
      await database
        .prepare(
          `SELECT COUNT(*) AS count
           FROM agent_usage_suspension_audit_records`,
        )
        .first<{ count: number }>(),
    ).toEqual({ count: 0 });
  });

  it("chooses the shortest breached period when enabled rules overlap", async () => {
    await configure("last_15_minutes", true, 1, 0.5);
    await configure("last_1_hour", true, 1, 2.75);
    await incrementAgentRequestAttempt(database, "client-overlap", "review", now - 1);

    await expect(
      incrementAgentRequestAttempt(database, "client-overlap", "rewrite", now),
    ).rejects.toMatchObject({
      publicDetails: {
        suspensionPeriod: "last_15_minutes",
        suspensionThreshold: 1,
        suspensionObservedCount: 2,
        suspensionExpiresAt: now + 30 * 60,
      },
    });
  });

  it("serializes concurrent attempts so only the allowed boundary can reach the AI provider", async () => {
    await configure("last_15_minutes", true, 3);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, index) =>
        incrementAgentRequestAttempt(
          database,
          "client-concurrent",
          index % 2 === 0 ? "review" : "rewrite",
          now,
        ),
      ),
    );

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(3);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(2);
    expect(
      await database
        .prepare(
          `SELECT COUNT(*) AS count
           FROM agent_request_events
           WHERE user_id = 'client-concurrent'`,
        )
        .first<{ count: number }>(),
    ).toEqual({ count: 4 });
    expect(
      await database
        .prepare(
          `SELECT configured_threshold, observed_request_count
           FROM agent_usage_suspension_audit_records
           WHERE subject_user_id = 'client-concurrent'`,
        )
        .first(),
    ).toEqual({ configured_threshold: 3, observed_request_count: 4 });
  });
});
