// Thin Google Calendar wrapper.
//
// Builds on Ananyaa's OAuth flow (src/app/api/auth/google/*). When a user has
// calendar_connected = true, we use the stored google_access_token (refreshing
// via google_refresh_token if expired) to read their upcoming events.
//
// The plan generator calls getUpcomingEvents() to know:
//   - which time windows are free between meetings
//   - where the user will be (location field on the event, if present)
//
// Returns a normalised, demo-safe shape. Never throws on auth failure —
// returns an empty array so the plan generator can still produce a manual-mode plan.

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

  // If the access token is expired, googleapis will auto-refresh using the
  // refresh token. We need to persist the new token back so future calls
  // don't keep refreshing.
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
        // All-day events have `date`; timed events have `dateTime`.
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
    // Auth expired beyond what refresh can fix, network blip, etc.
    // Fall back to "no calendar data" — the plan generator handles that.
    return [];
  }
}

/**
 * Compute free windows between scheduled events within the next `hoursAhead`.
 * Skips all-day events (they shouldn't block the whole day from planning).
 * Used by the plan generator to find slots the AI can fill with venue recs.
 */
export function findFreeWindows(
  events: CalendarEvent[],
  hoursAhead = 16,
  minDurationMinutes = 30
): { start: Date; end: Date }[] {
  const now = new Date();
  const horizon = new Date(now.getTime() + hoursAhead * 3600 * 1000);

  const busy = events
    .filter((e) => !e.allDay)
    .map((e) => ({ start: e.start, end: e.end }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const windows: { start: Date; end: Date }[] = [];
  let cursor = now;

  for (const b of busy) {
    if (b.start > cursor) {
      windows.push({ start: cursor, end: b.start });
    }
    if (b.end > cursor) cursor = b.end;
  }
  if (cursor < horizon) windows.push({ start: cursor, end: horizon });

  // Drop windows shorter than minDurationMinutes — not useful for a venue stop.
  return windows.filter(
    (w) => (w.end.getTime() - w.start.getTime()) / 60000 >= minDurationMinutes
  );
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
    // Non-fatal — old token will keep working until next refresh.
  }
}
