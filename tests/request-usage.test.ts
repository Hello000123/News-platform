import { readFile } from "node:fs/promises";

import type { D1Database } from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import { describe, expect, it } from "vitest";

import { listUserAccounts } from "@/lib/server/auth/repository";
import {
  describeAgentUsagePeriod,
  incrementAgentRequestAttempt,
} from "@/lib/server/auth/request-usage";

async function executeSqlScript(database: D1Database, sql: string) {
  for (const statement of sql.split(";").map((value) => value.trim()).filter(Boolean)) {
    await database.prepare(statement).run();
  }
}

describe("per-user agent request usage", () => {
  it("records timestamped attempts atomically while preserving legacy lifetime totals", async () => {
    const miniflare = new Miniflare({
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } };",
      d1Databases: { DB: "55555555-5555-5555-5555-555555555555" },
      cf: false,
    });

    try {
      const database = (await miniflare.getD1Database("DB")) as D1Database;
      const initial = await readFile(
        new URL("../migrations/0001_authentication.sql", import.meta.url),
        "utf8",
      );
      const usageMigration = await readFile(
        new URL("../migrations/0005_agent_request_usage.sql", import.meta.url),
        "utf8",
      );
      const eventMigration = await readFile(
        new URL("../migrations/0016_timestamped_agent_request_events.sql", import.meta.url),
        "utf8",
      );
      await executeSqlScript(database, initial);
      await executeSqlScript(database, usageMigration);
      await executeSqlScript(database, eventMigration);

      const now = 1_700_000_000;
      await database
        .prepare(
          `INSERT INTO users (
            id, email, full_name, role, status, created_at, updated_at
           ) VALUES
            ('client-counted', 'counted@example.test', 'Counted Client', 'client', 'active', ?, ?),
            ('client-zero', 'zero@example.test', 'Zero Client', 'client', 'active', ?, ?)`,
        )
        .bind(now, now, now, now)
        .run();

      await database
        .prepare(
          `INSERT INTO agent_request_usage (
            user_id, review_request_count, rewrite_request_count, updated_at
           ) VALUES ('client-counted', 10, 5, ?)`,
        )
        .bind(now - 10_000)
        .run();
      await database
        .prepare(
          `UPDATE agent_request_event_tracking
           SET started_at = ?
           WHERE singleton_id = 1`,
        )
        .bind(now - 1_800)
        .run();

      await Promise.all([
        incrementAgentRequestAttempt(database, "client-counted", "review", now - 900),
        incrementAgentRequestAttempt(database, "client-counted", "rewrite", now - 899),
        incrementAgentRequestAttempt(database, "client-counted", "review", now),
        incrementAgentRequestAttempt(database, "client-counted", "rewrite", now - 901),
      ]);

      const lifetimeAccounts = await listUserAccounts(database, "client", {
        usagePeriod: "lifetime",
        nowSeconds: now,
      });
      expect(lifetimeAccounts).toEqual([
        expect.objectContaining({
          id: "client-counted",
          reviewRequestCount: 12,
          rewriteRequestCount: 7,
          periodRequestCount: 19,
          periodReviewRequestCount: 12,
          periodRewriteRequestCount: 7,
        }),
        expect.objectContaining({
          id: "client-zero",
          reviewRequestCount: 0,
          rewriteRequestCount: 0,
          periodRequestCount: 0,
        }),
      ]);

      const lastFifteenMinutes = await listUserAccounts(database, "client", {
        usagePeriod: "last_15_minutes",
        nowSeconds: now,
      });
      expect(lastFifteenMinutes[0]).toMatchObject({
        id: "client-counted",
        reviewRequestCount: 12,
        rewriteRequestCount: 7,
        periodRequestCount: 3,
        periodReviewRequestCount: 2,
        periodRewriteRequestCount: 1,
      });

      const lastHour = await listUserAccounts(database, "client", {
        usagePeriod: "last_1_hour",
        nowSeconds: now,
      });
      expect(lastHour[0]).toMatchObject({
        periodRequestCount: 4,
        periodReviewRequestCount: 2,
        periodRewriteRequestCount: 2,
      });

      expect(
        await database
          .prepare(
            `SELECT COUNT(*) AS count
             FROM agent_request_events
             WHERE user_id = 'client-counted'`,
          )
          .first<{ count: number }>(),
      ).toEqual({ count: 4 });

      const completePeriod = await describeAgentUsagePeriod(
        database,
        "last_15_minutes",
        now,
      );
      expect(completePeriod).toMatchObject({
        period: "last_15_minutes",
        startAt: now - 900,
        endAt: now,
        trackingStartedAt: now - 1_800,
        isComplete: true,
      });
      await database
        .prepare(
          `UPDATE agent_request_event_tracking
           SET started_at = ?
           WHERE singleton_id = 1`,
        )
        .bind(now - 300)
        .run();
      expect(
        await describeAgentUsagePeriod(database, "last_15_minutes", now),
      ).toMatchObject({ isComplete: false });
      expect(
        await describeAgentUsagePeriod(database, "lifetime", now),
      ).toMatchObject({
        period: "lifetime",
        startAt: null,
        isComplete: true,
      });

      const indexes = await database
        .prepare("PRAGMA index_list('agent_request_events')")
        .all<{ name: string }>();
      expect(indexes.results.map(({ name }) => name)).toEqual(
        expect.arrayContaining([
          "agent_request_events_user_time_index",
          "agent_request_events_time_user_index",
        ]),
      );

      await expect(
        incrementAgentRequestAttempt(database, "missing-user", "review", now),
      ).rejects.toThrow();
      expect(
        await database
          .prepare(
            `SELECT COUNT(*) AS count
             FROM agent_request_events
             WHERE user_id = 'missing-user'`,
          )
          .first<{ count: number }>(),
      ).toEqual({ count: 0 });
      expect(
        await database
          .prepare(
            `SELECT COUNT(*) AS count
             FROM agent_request_usage
             WHERE user_id = 'missing-user'`,
          )
          .first<{ count: number }>(),
      ).toEqual({ count: 0 });
    } finally {
      await miniflare.dispose();
    }
  });
});
