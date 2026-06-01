import type { CalendarEvent } from "@/lib/calendar/events";

const IST_TIMEZONE = "Asia/Kolkata";
const DEDUPE_WINDOW_MS = 30 * 60 * 1000;

export interface ManualEventInput {
  id: string;
  startTime: string;
  endTime: string;
  activity: string;
  explanation?: string;
  /** @deprecated legacy single-time entries */
  time?: string;
}

export function istTodayAtHHMM(hhmm: string): Date {
  const [hourRaw, minuteRaw] = hhmm.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw ?? 0);

  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";

  return new Date(
    `${year}-${month}-${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+05:30`
  );
}

export function resolveManualWindow(entry: ManualEventInput): {
  startTime: string;
  endTime: string;
} | null {
  const startTime = entry.startTime || entry.time || "";
  const endTime = entry.endTime || "";

  if (!startTime || !endTime) return null;
  if (startTime === endTime) return null;

  return { startTime, endTime };
}

/** Build IST start/end dates; rolls end to the next day when end <= start (e.g. 22:00–06:00). */
export function manualWindowToDates(
  startTime: string,
  endTime: string
): { start: Date; end: Date } {
  const start = istTodayAtHHMM(startTime);
  let end = istTodayAtHHMM(endTime);

  if (end.getTime() <= start.getTime()) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }

  return { start, end };
}

/**
 * Overnight manual blocks (e.g. sleep 23:00–07:00) become two segments:
 * last night → wake this morning, and tonight → wake tomorrow.
 */
function manualEntryToCalendarEvents(
  entry: ManualEventInput
): CalendarEvent[] {
  const window = resolveManualWindow(entry);
  if (!window || !entry.activity.trim()) return [];

  const title = entry.activity.trim();
  const location = entry.explanation?.trim() || null;
  const start = istTodayAtHHMM(window.startTime);
  const end = istTodayAtHHMM(window.endTime);

  if (end.getTime() > start.getTime()) {
    return [
      {
        id: `manual-${entry.id}`,
        title,
        start,
        end,
        location,
        allDay: false,
      },
    ];
  }

  const startYesterday = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  const endTomorrow = new Date(end.getTime() + 24 * 60 * 60 * 1000);

  return [
    {
      id: `manual-${entry.id}-lastnight`,
      title,
      start: startYesterday,
      end,
      location,
      allDay: false,
    },
    {
      id: `manual-${entry.id}-tonight`,
      title,
      start,
      end: endTomorrow,
      location,
      allDay: false,
    },
  ];
}

export function manualEntriesToEvents(
  entries: ManualEventInput[]
): CalendarEvent[] {
  return entries.flatMap((entry) => manualEntryToCalendarEvents(entry));
}

export function mergeScheduleEvents(
  calendarEvents: CalendarEvent[],
  manualEvents: CalendarEvent[]
): CalendarEvent[] {
  const merged: CalendarEvent[] = [...calendarEvents];

  for (const event of manualEvents) {
    const duplicate = merged.find(
      (existing) =>
        existing.title.toLowerCase() === event.title.toLowerCase() &&
        Math.abs(existing.start.getTime() - event.start.getTime()) <=
          DEDUPE_WINDOW_MS
    );

    if (!duplicate) {
      merged.push(event);
    }
  }

  return merged.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function formatManualWindowLabel(startTime: string, endTime: string): string {
  return `${startTime} — ${endTime}`;
}
