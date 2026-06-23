// src/lib/planning/horizon.ts
//
// Single-day planning horizon. The window NEVER spills past tonight.
//
// Rule (confirmed product spec):
//   end = min(now + maxHoursAhead, tonight's IST midnight)
//
//   - Generate at 06:00 -> now+16h = 22:00, midnight is further out -> 16h wins.
//   - Generate at 21:00 -> now+16h = 13:00 tomorrow, midnight is closer
//     -> midnight wins -> plan runs 21:00 -> 00:00, no spill into tomorrow.
//
// The bottom edge (generated inside 00:00-05:00) is handled by the EXISTING
// src/lib/planning/quietHours.ts, which bumps the start to 05:00 IST. This
// module only computes the TOP edge (the single-day cap). Call quietHours
// first to clamp the start, then computeHorizon to clamp the end.

const DEFAULT_MAX_HOURS_AHEAD = 16;
const IST_OFFSET = "+05:30";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Tonight's IST midnight as a UTC `Date` instant — i.e. the start of TOMORROW
 * in IST. Vercel runs in UTC, so we build the boundary from explicit IST parts
 * (same pattern as quietHours.ts) instead of trusting the server clock's tz.
 */
export function istMidnightTonight(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  const d = Number(parts.find((p) => p.type === "day")!.value);

  // Start of today in IST, expressed as a UTC instant.
  const todayMidnightIst = new Date(
    `${y}-${pad2(m)}-${pad2(d)}T00:00:00${IST_OFFSET}`,
  );
  // Tonight's midnight = start of tomorrow = +24h.
  return new Date(todayMidnightIst.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Compute the single-day planning window end.
 *
 * @param now            current instant
 * @param windowStart    the (already quiet-hours-clamped) start of planning
 * @param maxHoursAhead  the rolling horizon cap (default 16h)
 * @returns end instant = min(start + maxHoursAhead, tonight's IST midnight)
 */
export function computeHorizonEnd(
  now: Date,
  windowStart: Date = now,
  maxHoursAhead: number = DEFAULT_MAX_HOURS_AHEAD,
): Date {
  const rolling = new Date(
    windowStart.getTime() + maxHoursAhead * 60 * 60 * 1000,
  );
  const midnight = istMidnightTonight(now);
  return rolling < midnight ? rolling : midnight;
}

/**
 * Convenience: returns the full clamped window. `start` should already have
 * passed the quiet-hours guard (this does not re-implement it).
 */
export function computeHorizon(
  now: Date,
  windowStart: Date = now,
  maxHoursAhead: number = DEFAULT_MAX_HOURS_AHEAD,
): { start: Date; end: Date } {
  return {
    start: windowStart,
    end: computeHorizonEnd(now, windowStart, maxHoursAhead),
  };
}
