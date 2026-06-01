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

/** Google Calendar and/or at least one valid manual commitment for today. */
export function userHasScheduleSource(
  user: Pick<SaanjhUser, "calendar_connected" | "manual_schedule">
): boolean {
  return (
    Boolean(user.calendar_connected) ||
    hasActiveManualSchedule(user.manual_schedule)
  );
}

export async function getMergedScheduleEvents(
  user: SaanjhUser,
  hoursAhead = DEFAULT_HOURS_AHEAD
): Promise<CalendarEvent[]> {
  const calendarEvents = await getUpcomingEvents(user, {
    hoursAhead,
    maxResults: 40,
  });
  const manualEvents = manualEntriesToEvents(
    parseManualSchedule(user.manual_schedule)
  );
  return mergeScheduleEvents(calendarEvents, manualEvents);
}

export async function fetchFreeWindowsForUser(
  user: SaanjhUser,
  hoursAhead = DEFAULT_HOURS_AHEAD,
  minDurationMinutes = 30
): Promise<{ start: Date; end: Date }[]> {
  const events = await getMergedScheduleEvents(user, hoursAhead);
  return findFreeWindows(events, hoursAhead, minDurationMinutes);
}
