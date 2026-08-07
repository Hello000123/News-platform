import { z } from "zod";

import type { D1Database } from "@cloudflare/workers-types";

import { getDatabase } from "@/lib/server/auth/database";
import { requireApiSession } from "@/lib/server/auth/guards";
import { authErrorResponse } from "@/lib/server/auth/http";
import { readJsonRequest, jsonResponse } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface FeedScheduleRow {
  enabled: number;
  interval_minutes: number;
  last_auto_fetch_at: number | null;
}

async function getScheduleSettings(database: D1Database): Promise<FeedScheduleRow | null> {
  return database
    .prepare(
      "SELECT enabled, interval_minutes, last_auto_fetch_at FROM feed_schedule_settings WHERE id = 1",
    )
    .first<FeedScheduleRow>();
}

const updateScheduleSchema = z.object({
  enabled: z.boolean(),
  intervalMinutes: z
    .number()
    .int()
    .min(15, "The interval must be at least 15 minutes.")
    .max(1440, "The interval cannot exceed 24 hours."),
});

export async function GET(request: Request) {
  try {
    await requireApiSession(request, ["employee"]);
    const row = await getScheduleSettings(getDatabase());

    return jsonResponse({
      enabled: row?.enabled === 1,
      intervalMinutes: row?.interval_minutes ?? 360,
      lastAutoFetchAt: row?.last_auto_fetch_at ?? null,
    });
  } catch (error) {
    return authErrorResponse(error, {
      operation: "feed-schedule.get",
      request,
    });
  }
}

export async function PUT(request: Request) {
  try {
    await requireApiSession(request, ["employee"], { csrf: true });
    const input = updateScheduleSchema.parse(await readJsonRequest(request));
    const database = getDatabase();

    await database
      .prepare(
        `INSERT INTO feed_schedule_settings (id, enabled, interval_minutes, updated_at)
         VALUES (1, ?, ?, unixepoch())
         ON CONFLICT(id) DO UPDATE SET
           enabled = excluded.enabled,
           interval_minutes = excluded.interval_minutes,
           updated_at = excluded.updated_at`,
      )
      .bind(input.enabled ? 1 : 0, input.intervalMinutes)
      .run();

    const updated = await getScheduleSettings(database);
    return jsonResponse({
      enabled: updated?.enabled === 1,
      intervalMinutes: updated?.interval_minutes ?? 360,
      lastAutoFetchAt: updated?.last_auto_fetch_at ?? null,
    });
  } catch (error) {
    return authErrorResponse(error, {
      operation: "feed-schedule.update",
      request,
    });
  }
}
