import { describe, expect, it } from "vitest";

import {
  AGENT_USAGE_BUSINESS_TIME_ZONE,
  AGENT_USAGE_PERIODS,
  isAgentUsagePeriod,
  resolveAgentUsageWindow,
  type AgentUsagePeriod,
} from "@/lib/shared/agent-usage";

describe("AI usage period windows", () => {
  it("defines every required selectable period", () => {
    expect(AGENT_USAGE_PERIODS.map(({ key }) => key)).toEqual([
      "last_15_minutes",
      "last_1_hour",
      "last_6_hours",
      "last_12_hours",
      "last_24_hours",
      "last_7_days",
      "last_30_days",
      "last_90_days",
      "last_180_days",
      "last_365_days",
      "month_to_date",
      "year_to_date",
      "lifetime",
    ]);
    expect(isAgentUsagePeriod("last_15_minutes")).toBe(true);
    expect(isAgentUsagePeriod("unsupported")).toBe(false);
  });

  it.each<readonly [AgentUsagePeriod, number]>([
    ["last_15_minutes", 15 * 60],
    ["last_1_hour", 60 * 60],
    ["last_6_hours", 6 * 60 * 60],
    ["last_12_hours", 12 * 60 * 60],
    ["last_24_hours", 24 * 60 * 60],
    ["last_7_days", 7 * 24 * 60 * 60],
    ["last_30_days", 30 * 24 * 60 * 60],
    ["last_90_days", 90 * 24 * 60 * 60],
    ["last_180_days", 180 * 24 * 60 * 60],
    ["last_365_days", 365 * 24 * 60 * 60],
  ])("uses an exact rolling window for %s", (period, seconds) => {
    const now = 1_800_000_000;
    expect(resolveAgentUsageWindow(period, now)).toEqual({
      period,
      label: AGENT_USAGE_PERIODS.find(({ key }) => key === period)?.label,
      startAt: now - seconds,
      endAt: now,
      timeZone: AGENT_USAGE_BUSINESS_TIME_ZONE,
    });
  });

  it("calculates month-to-date and year-to-date at Hong Kong calendar boundaries", () => {
    const now = Math.floor(Date.UTC(2026, 1, 28, 16, 30) / 1_000);
    expect(resolveAgentUsageWindow("month_to_date", now)).toMatchObject({
      startAt: Math.floor(Date.UTC(2026, 1, 28, 16, 0) / 1_000),
      endAt: now,
      timeZone: "Asia/Hong_Kong",
    });
    expect(resolveAgentUsageWindow("year_to_date", now)).toMatchObject({
      startAt: Math.floor(Date.UTC(2025, 11, 31, 16, 0) / 1_000),
      endAt: now,
      timeZone: "Asia/Hong_Kong",
    });
    expect(resolveAgentUsageWindow("lifetime", now)).toMatchObject({
      startAt: null,
      endAt: now,
    });
  });

  it("rejects non-deterministic or invalid timestamps", () => {
    expect(() => resolveAgentUsageWindow("last_1_hour", -1)).toThrow(TypeError);
    expect(() => resolveAgentUsageWindow("last_1_hour", 1.5)).toThrow(TypeError);
  });
});
