const IST_TIMEZONE = "Asia/Kolkata";

/** Midnight–4:59 AM IST — plan generation is paused. */
export const QUIET_HOURS_START = 0;
export const QUIET_HOURS_END = 5;

export const PLANNING_QUIET_HOURS_ERROR = "planning_quiet_hours";

export const PLANNING_QUIET_HOURS_MESSAGE =
  "Plan generation opens at 5 AM IST. Check back then to plan your day.";

function istHour(date: Date): number {
  const hourStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIMEZONE,
    hour: "2-digit",
    hour12: false,
  }).format(date);
  return Number(hourStr.slice(0, 2));
}

export function isPlanningQuietHours(date = new Date()): boolean {
  const hour = istHour(date);
  return hour >= QUIET_HOURS_START && hour < QUIET_HOURS_END;
}

/** Next 5:00 AM IST while inside the quiet window. */
export function getPlanningOpensAt(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";

  return new Date(`${year}-${month}-${day}T05:00:00+05:30`);
}

export function planningQuietHoursPayload(now = new Date()) {
  return {
    error: PLANNING_QUIET_HOURS_ERROR,
    message: PLANNING_QUIET_HOURS_MESSAGE,
    opensAt: getPlanningOpensAt(now).toISOString(),
  };
}

export function formatPlanningOpensAt(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}
