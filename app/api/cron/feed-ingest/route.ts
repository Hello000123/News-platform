import { getDatabase } from "@/lib/server/auth/database";
import { nowInSeconds } from "@/lib/server/auth/crypto";
import { AppError } from "@/lib/server/errors";
import { ingestAllFeeds } from "@/lib/server/feeds/pipeline";
import { jsonResponse } from "@/lib/server/http";

import type { D1Database } from "@cloudflare/workers-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Shared cron-ingest logic used by both the Cloudflare Worker scheduled
 * handler and the local testing endpoint. Checks the schedule settings
 * before running ingestion.
 */
export async function runScheduledIngest(database: D1Database) {
  const row = await database
    .prepare(
      "SELECT enabled, interval_minutes, last_auto_fetch_at FROM feed_schedule_settings WHERE id = 1",
    )
    .first<{
      enabled: number;
      interval_minutes: number;
      last_auto_fetch_at: number | null;
    }>();

  if (!row || row.enabled !== 1) {
    return { skipped: true, reason: "schedule_disabled" } as const;
  }

  const now = nowInSeconds();
  const intervalSeconds = row.interval_minutes * 60;
  if (row.last_auto_fetch_at && now - row.last_auto_fetch_at < intervalSeconds) {
    return { skipped: true, reason: "not_due" } as const;
  }

  const summary = await ingestAllFeeds(database);
  await database
    .prepare("UPDATE feed_schedule_settings SET last_auto_fetch_at = ? WHERE id = 1")
    .bind(now)
    .run();

  return {
    skipped: false,
    totalParsed: summary.totalParsed,
    totalAdded: summary.totalAdded,
    failedCount: summary.failedCount,
  } as const;
}

/**
 * Manual trigger endpoint for local testing and Docker cron. Requires a
 * shared CRON_SECRET header so external schedulers can invoke it without
 * a browser session.
 */
export async function POST(request: Request) {
  try {
    const secret = request.headers.get("x-cron-secret");
    const expected = process.env.CRON_SECRET?.trim();
    if (!expected || secret !== expected) {
      throw new AppError(
        "CRON_UNAUTHORIZED",
        "The cron secret is missing or invalid.",
        401,
      );
    }

    const result = await runScheduledIngest(getDatabase());
    return jsonResponse(result);
  } catch (error) {
    if (error instanceof AppError) {
      return jsonResponse({ error: error.publicMessage }, error.status);
    }
    return jsonResponse({ error: "Cron ingest failed." }, 502);
  }
}
