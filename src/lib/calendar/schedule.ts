import {
  findFreeWindows,
  getUpcomingEvents,
  type CalendarEvent,
} from "@/lib/calendar/events";
import {
  manualEntriesToEvents,
  mergeScheduleEvents,
  resolveManualWindow,
} from "@/lib/calendar/manualEvents";
import type { ManualScheduleEntry } from "@/lib/types/home";
import type { SaanjhUser } from "@/lib/types/user";

// Default lookahead for schedule fetches. Home overrides this with the user's
// `hoursAhead` request param; Friends keeps it at 72h to give the joint
// availability detector room to surface overlap into tomorrow / day-after.
const DEFAULT_HOURS_AHEAD = 72;

export function parseManualSchedule(raw: unknown): ManualScheduleEntry[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry): ManualScheduleEntry | null => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      if (typeof item.id !== "string") return null;

      const startTime =
        typeof item.startTime === "string"
          ? item.startTime
          : typeof item.time === "string"
            ? item.time
            : "";
      const endTime = typeof item.endTime === "string" ? item.endTime : "";

      if (!startTime || !endTime || startTime === endTime) return null;
      if (typeof item.activity !== "string" || !item.activity.trim()) {
        return null;
      }

      return {
        id: item.id,
        startTime,
        endTime,
        activity: item.activity.trim(),
        explanation:
          typeof item.explanation === "string" ? item.explanation : undefined,
      };
    })
    .filter((entry): entry is ManualScheduleEntry => entry !== null);
}

export function hasActiveManualSchedule(
  entries: ManualScheduleEntry[] | unknown
): boolean {
  const parsed = Array.isArray(entries)
    ? entries
    : parseManualSchedule(entries);
  return parsed.some((entry) => resolveManualWindow(entry) !== null);
}

/**
 * Whether the user has ANY usable schedule source (Google Calendar OR manual).
 * Used by the Friends availability detector to decide whether to nudge a user
 * to share their schedule.
 */
export function userHasScheduleSource(
  user: Pick<SaanjhUser, "calendar_connected" | "manual_schedule">
): boolean {
  return (
    Boolean(user.calendar_connected) ||
    hasActiveManualSchedule(user.manual_schedule)
  );
}

/**
 * Whether the user has Google Calendar connected. Friends plan generation
 * requires this for BOTH users — joint planning runs on calendar data only
 * (manual entries on the user record are deliberately ignored).
 */
export function userHasCalendarSource(
  user: Pick<SaanjhUser, "calendar_connected">
): boolean {
  return Boolean(user.calendar_connected);
}

/**
 * Home tab schedule source.
 *
 * Manual-wins rule: if the user has saved manual entries, the day is built
 * from THOSE — Google Calendar is ignored entirely. This mirrors the inline
 * logic in /api/plan/generate/route.ts and exists as a helper for any future
 * Home-side caller that needs the same source-of-truth selection.
 *
 * Friends should NOT call this — use `getCalendarOnlyEvents` instead.
 */
export async function getHomeScheduleEvents(
  user: SaanjhUser,
  hoursAhead = DEFAULT_HOURS_AHEAD
): Promise<CalendarEvent[]> {
  const manualEvents = manualEntriesToEvents(
    parseManualSchedule(user.manual_schedule)
  );
  if (manualEvents.length > 0) return manualEvents;

  const calendarEvents = await getUpcomingEvents(user, {
    hoursAhead,
    maxResults: 40,
  });
  // Defensive merge — should be a no-op since manualEvents is empty here.
  return mergeScheduleEvents(calendarEvents, manualEvents);
}

/**
 * Friends-only schedule source: Google Calendar ONLY.
 *
 * Manual entries on the user record are deliberately ignored. Joint planning
 * requires explicit shared availability across two users, which only Google
 * Calendar provides on a comparable basis. A user who has only manual entries
 * (no calendar connected) returns an empty event list from this fetcher —
 * the orchestrator surfaces this as "connect calendar" in the UI.
 */
export async function getCalendarOnlyEvents(
  user: SaanjhUser,
  hoursAhead = DEFAULT_HOURS_AHEAD
): Promise<CalendarEvent[]> {
  if (!user.calendar_connected) return [];
  return getUpcomingEvents(user, { hoursAhead, maxResults: 40 });
}
