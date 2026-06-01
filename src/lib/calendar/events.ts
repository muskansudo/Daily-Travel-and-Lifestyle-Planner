// Thin Google Calendar wrapper + the canonical busy/free interval helpers.
//
// Two responsibilities live here:
//
//   1. Read events from Google Calendar (getUpcomingEvents). Builds on Ananyaa's
//      OAuth flow (src/app/api/auth/google/*). When a user has
//      calendar_connected = true, we use the stored google_access_token
//      (refreshing via google_refresh_token if expired) to read their upcoming
//      events. Returns [] on auth/API failure — never throws — so the plan
//      generator keeps working in manual-only mode.
//
//   2. Compute busy intervals + free windows from any event list. This is the
//      single source of truth for "what is the user actually doing today" that
//      the orchestrator and the slot allocator both consume. Sleep that crosses
//      midnight gets mirrored one day back so an early-morning regen doesn't
//      think 2 AM is free.

import { google } from "googleapis";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SaanjhUser } from "@/lib/types/user";

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  location: string | null;
  allDay: boolean;
}

interface FetchOptions {
  hoursAhead?: number; // default 24
  maxResults?: number; // default 20
}

/**
 * Fetch upcoming events for a user. Returns [] on any auth/API failure —
 * the plan generator must keep working even if Google is sad.
 */
export async function getUpcomingEvents(
  user: SaanjhUser,
  options: FetchOptions = {}
): Promise<CalendarEvent[]> {
  if (!user.calendar_connected || !user.google_access_token) return [];

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({
    access_token: user.google_access_token,
    refresh_token: user.google_refresh_token ?? undefined,
    expiry_date: user.google_token_expiry
      ? new Date(user.google_token_expiry).getTime()
      : undefined,
  });

  oauth2.on("tokens", (tokens) => {
    void persistRefreshedTokens(user.id, tokens);
  });

  const hoursAhead = options.hoursAhead ?? 24;
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + hoursAhead * 3600 * 1000).toISOString();

  try {
    const cal = google.calendar({ version: "v3", auth: oauth2 });
    const res = await cal.events.list({
      calendarId: "primary",
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: options.maxResults ?? 20,
    });

    const items = res.data.items ?? [];
    return items
      .map((e): CalendarEvent | null => {
        const startStr = e.start?.dateTime ?? e.start?.date;
        const endStr = e.end?.dateTime ?? e.end?.date;
        if (!startStr || !endStr) return null;
        return {
          id: e.id ?? "",
          title: e.summary ?? "(no title)",
          start: new Date(startStr),
          end: new Date(endStr),
          location: e.location ?? null,
          allDay: !e.start?.dateTime,
        };
      })
      .filter((x): x is CalendarEvent => x !== null);
  } catch {
    return [];
  }
}

export interface BusyInterval {
  start: Date;
  end: Date;
}

export function buildBusyIntervals(events: CalendarEvent[]): BusyInterval[] {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const intervals: BusyInterval[] = [];

  for (const e of events) {
    if (e.allDay) continue;
    intervals.push({ start: e.start, end: e.end });
    if (spansMidnightIST(e.start, e.end)) {
      intervals.push({
        start: new Date(e.start.getTime() - DAY_MS),
        end: new Date(e.end.getTime() - DAY_MS),
      });
    }
  }

  return intervals.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function spansMidnightIST(start: Date, end: Date): boolean {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  return fmt(start) !== fmt(end);
}

export function overlapsAnyBusy(
  start: Date,
  end: Date,
  busy: BusyInterval[]
): boolean {
  const s = start.getTime();
  const e = end.getTime();
  for (const b of busy) {
    if (s < b.end.getTime() && e > b.start.getTime()) return true;
  }
  return false;
}

export function findFreeWindows(
  events: CalendarEvent[],
  hoursAhead = 16,
  minDurationMinutes = 30
): { start: Date; end: Date }[] {
  const now = new Date();
  const horizon = new Date(now.getTime() + hoursAhead * 3600 * 1000);
  const busy = buildBusyIntervals(events);

  const windows: { start: Date; end: Date }[] = [];
  let cursor = now;

  for (const b of busy) {
    if (b.start > cursor) {
      windows.push({ start: cursor, end: b.start });
    }
    if (b.end > cursor) cursor = b.end;
  }
  if (cursor < horizon) windows.push({ start: cursor, end: horizon });

  return windows.filter(
    (w) => (w.end.getTime() - w.start.getTime()) / 60000 >= minDurationMinutes
  );
}

/** Free windows inside a fixed IST range (friends overlap / full day). */
export function findFreeWindowsInRange(
  events: CalendarEvent[],
  rangeStart: Date,
  rangeEnd: Date,
  minDurationMinutes = 30
): { start: Date; end: Date }[] {
  const busy = buildBusyIntervals(events);

  const windows: { start: Date; end: Date }[] = [];
  let cursor = rangeStart;

  for (const block of busy) {
    if (block.end <= rangeStart || block.start >= rangeEnd) continue;

    const blockStart = new Date(
      Math.max(block.start.getTime(), rangeStart.getTime())
    );
    const blockEnd = new Date(Math.min(block.end.getTime(), rangeEnd.getTime()));

    if (blockStart > cursor) {
      windows.push({ start: cursor, end: blockStart });
    }
    if (blockEnd > cursor) cursor = blockEnd;
  }

  if (cursor < rangeEnd) {
    windows.push({ start: cursor, end: rangeEnd });
  }

  return windows.filter(
    (w) => (w.end.getTime() - w.start.getTime()) / 60000 >= minDurationMinutes
  );
}

/** Home orchestrator: pick longest windows first. */
export function pickPrioritizedWindows(
  windows: { start: Date; end: Date }[],
  max: number
): { start: Date; end: Date }[] {
  if (max <= 0) return [];

  const ranked = [...windows].sort((a, b) => {
    const da = a.end.getTime() - a.start.getTime();
    const db = b.end.getTime() - b.start.getTime();
    return db - da;
  });

  return ranked
    .slice(0, max)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Friends collab: split long gaps into plan-sized chunks. */
export function splitPlanWindows(
  windows: { start: Date; end: Date }[],
  maxMinutes = 180,
  minDurationMinutes = 45
): { start: Date; end: Date }[] {
  const chunks: { start: Date; end: Date }[] = [];

  for (const window of windows) {
    let cursor = window.start;

    while (cursor < window.end) {
      const chunkEnd = new Date(
        Math.min(cursor.getTime() + maxMinutes * 60_000, window.end.getTime())
      );
      const durationMin = (chunkEnd.getTime() - cursor.getTime()) / 60_000;

      if (durationMin >= minDurationMinutes) {
        chunks.push({ start: cursor, end: chunkEnd });
      }

      cursor = chunkEnd;
    }
  }

  return chunks;
}

export function hhmmToDateInWindow(hhmm: string, anchor: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(anchor);

  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const anchorHour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const anchorMinute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);

  const [hourRaw, minuteRaw] = hhmm.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw ?? 0);

  const base = new Date(
    `${year}-${month}-${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+05:30`
  );

  if (hour * 60 + minute < anchorHour * 60 + anchorMinute) {
    return new Date(base.getTime() + 24 * 60 * 60 * 1000);
  }
  return base;
}

async function persistRefreshedTokens(
  userId: string,
  tokens: { access_token?: string | null; expiry_date?: number | null }
) {
  if (!tokens.access_token) return;
  try {
    const supabase = createAdminClient();
    await supabase
      .from("users")
      .update({
        google_access_token: tokens.access_token,
        google_token_expiry: tokens.expiry_date
          ? new Date(tokens.expiry_date).toISOString()
          : null,
      })
      .eq("id", userId);
  } catch {
    // Non-fatal
  }
}