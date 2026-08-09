export const AGENT_USAGE_BUSINESS_TIME_ZONE = "Asia/Hong_Kong";

export const AGENT_USAGE_PERIODS = [
  { key: "last_15_minutes", label: "Last 15 minutes", rollingSeconds: 15 * 60 },
  { key: "last_1_hour", label: "Last 1 hour", rollingSeconds: 60 * 60 },
  { key: "last_6_hours", label: "Last 6 hours", rollingSeconds: 6 * 60 * 60 },
  { key: "last_12_hours", label: "Last 12 hours", rollingSeconds: 12 * 60 * 60 },
  { key: "last_24_hours", label: "Last 24 hours", rollingSeconds: 24 * 60 * 60 },
  { key: "last_7_days", label: "Last 7 days", rollingSeconds: 7 * 24 * 60 * 60 },
  { key: "last_30_days", label: "Last 30 days", rollingSeconds: 30 * 24 * 60 * 60 },
  { key: "last_90_days", label: "Last 90 days", rollingSeconds: 90 * 24 * 60 * 60 },
  { key: "last_180_days", label: "Last 180 days", rollingSeconds: 180 * 24 * 60 * 60 },
  { key: "last_365_days", label: "Last 365 days", rollingSeconds: 365 * 24 * 60 * 60 },
  { key: "month_to_date", label: "Month to date" },
  { key: "year_to_date", label: "Year to date" },
  { key: "lifetime", label: "Lifetime" },
] as const;

export type AgentUsagePeriod = (typeof AGENT_USAGE_PERIODS)[number]["key"];

export interface AgentUsageWindow {
  period: AgentUsagePeriod;
  label: string;
  startAt: number | null;
  endAt: number;
  timeZone: typeof AGENT_USAGE_BUSINESS_TIME_ZONE;
}

export const DEFAULT_AGENT_USAGE_PERIOD: AgentUsagePeriod = "lifetime";

const HONG_KONG_UTC_OFFSET_SECONDS = 8 * 60 * 60;

export function isAgentUsagePeriod(value: unknown): value is AgentUsagePeriod {
  return AGENT_USAGE_PERIODS.some((period) => period.key === value);
}

export function agentUsagePeriodLabel(period: AgentUsagePeriod) {
  return AGENT_USAGE_PERIODS.find((candidate) => candidate.key === period)?.label
    ?? AGENT_USAGE_PERIODS.at(-1)?.label
    ?? "Lifetime";
}

function hongKongCalendarStart(
  nowSeconds: number,
  boundary: "month" | "year",
) {
  const hongKongDate = new Date(
    (nowSeconds + HONG_KONG_UTC_OFFSET_SECONDS) * 1_000,
  );
  const year = hongKongDate.getUTCFullYear();
  const month = boundary === "month" ? hongKongDate.getUTCMonth() : 0;
  return Math.floor(
    Date.UTC(year, month, 1) / 1_000 - HONG_KONG_UTC_OFFSET_SECONDS,
  );
}

export function resolveAgentUsageWindow(
  period: AgentUsagePeriod,
  nowSeconds: number,
): AgentUsageWindow {
  if (!Number.isInteger(nowSeconds) || nowSeconds < 0) {
    throw new TypeError("Agent usage window time must be a non-negative whole Unix timestamp.");
  }

  const definition = AGENT_USAGE_PERIODS.find((candidate) => candidate.key === period);
  if (!definition) throw new TypeError("Unsupported agent usage period.");

  let startAt: number | null = null;
  if ("rollingSeconds" in definition) {
    startAt = Math.max(0, nowSeconds - definition.rollingSeconds);
  } else if (period === "month_to_date") {
    startAt = hongKongCalendarStart(nowSeconds, "month");
  } else if (period === "year_to_date") {
    startAt = hongKongCalendarStart(nowSeconds, "year");
  }

  return {
    period,
    label: definition.label,
    startAt,
    endAt: nowSeconds,
    timeZone: AGENT_USAGE_BUSINESS_TIME_ZONE,
  };
}
