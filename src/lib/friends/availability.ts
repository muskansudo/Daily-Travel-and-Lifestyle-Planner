import { findFreeWindowsInRange } from "@/lib/calendar/events";
import {
  getCalendarOnlyEvents,
  userHasCalendarSource,
} from "@/lib/calendar/schedule";
import { istTodayAtHHMM } from "@/lib/calendar/manualEvents";
import { intersectTags } from "@/lib/friends/alignment";
import { tagIdsToLabels } from "@/lib/friends/tagLabels";
import type {
  FriendAvailability,
  SharedFreeTimeWindow,
} from "@/lib/types/friends";
import type { SaanjhUser } from "@/lib/types/user";

const IST = "Asia/Kolkata";
/** Friends planning only considers the rest of today (IST). */
const HOURS_AHEAD = 24;
const MIN_OVERLAP_MINUTES = 30;

function startOfTodayIST(): Date {
  return istTodayAtHHMM("00:00");
}

function endOfTodayIST(): Date {
  return istTodayAtHHMM("23:59");
}

/** Trim a window to today's IST calendar day (midnight → 23:59), not "from now". */
export function clipWindowToCalendarDayIST(
  window: TimeWindow
): TimeWindow | null {
  const dayStart = startOfTodayIST();
  const dayEnd = endOfTodayIST();
  const start = new Date(Math.max(window.start.getTime(), dayStart.getTime()));
  const end = new Date(Math.min(window.end.getTime(), dayEnd.getTime()));
  if (end.getTime() - start.getTime() < MIN_OVERLAP_MINUTES * 60_000) {
    return null;
  }
  return { start, end };
}

function clipWindowsToCalendarDayIST(windows: TimeWindow[]): TimeWindow[] {
  return windows
    .map(clipWindowToCalendarDayIST)
    .filter((w): w is TimeWindow => w !== null);
}

export interface TimeWindow {
  start: Date;
  end: Date;
}

function durationMinutes(window: TimeWindow): number {
  return (window.end.getTime() - window.start.getTime()) / 60_000;
}

function getIstWeekday(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: IST,
    weekday: "short",
  }).format(date);
}

function getIstDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatIstTime(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatWindowRangeIST(window: TimeWindow): string {
  return `${formatIstTime(window.start)} – ${formatIstTime(window.end)}`;
}

export function formatDurationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function windowOverlap(a: TimeWindow, b: TimeWindow): TimeWindow | null {
  const start = new Date(Math.max(a.start.getTime(), b.start.getTime()));
  const end = new Date(Math.min(a.end.getTime(), b.end.getTime()));
  if (end.getTime() - start.getTime() < MIN_OVERLAP_MINUTES * 60_000) {
    return null;
  }
  return { start, end };
}

export function intersectFreeWindows(
  mine: TimeWindow[],
  theirs: TimeWindow[]
): TimeWindow[] {
  const overlaps: TimeWindow[] = [];

  for (const a of mine) {
    for (const b of theirs) {
      const overlap = windowOverlap(a, b);
      if (overlap) overlaps.push(overlap);
    }
  }

  return overlaps.sort((x, y) => x.start.getTime() - y.start.getTime());
}

/** Merge overlapping or touching intervals (for a clean plan-ready list). */
export function mergeOverlappingWindows(windows: TimeWindow[]): TimeWindow[] {
  if (windows.length === 0) return [];

  const sorted = [...windows].sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );
  const merged: TimeWindow[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const current = sorted[i];

    if (current.start.getTime() <= last.end.getTime()) {
      last.end = new Date(
        Math.max(last.end.getTime(), current.end.getTime())
      );
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

export function windowStatus(
  window: TimeWindow
): SharedFreeTimeWindow["status"] {
  const now = Date.now();
  if (window.end.getTime() <= now) return "past";
  if (window.start.getTime() <= now) return "current";
  return "upcoming";
}

export function windowsToSharedFreeTimes(
  windows: TimeWindow[]
): SharedFreeTimeWindow[] {
  return windows.map((window, index) => {
    const minutes = Math.round(durationMinutes(window));
    return {
      id: `shared-${window.start.getTime()}-${index}`,
      rangeLabel: formatWindowRangeIST(window),
      durationLabel: formatDurationLabel(minutes),
      startIso: window.start.toISOString(),
      endIso: window.end.toISOString(),
      durationMinutes: minutes,
      status: windowStatus(window),
    };
  });
}

/** Every mutual free slot today (IST), merged and sorted for joint planning. */
export async function getTodaySharedFreeWindows(
  me: SaanjhUser,
  friend: SaanjhUser
): Promise<TimeWindow[]> {
  const [myFree, friendFree] = await Promise.all([
    fetchFreeWindows(me),
    fetchFreeWindows(friend),
  ]);

  const raw = clipWindowsToCalendarDayIST(
    intersectFreeWindows(myFree, friendFree)
  );
  return mergeOverlappingWindows(raw);
}

function tonightEveningBounds(): TimeWindow {
  return {
    start: istTodayAtHHMM("17:00"),
    end: istTodayAtHHMM("23:59"),
  };
}

function overlapsTonightEvening(window: TimeWindow): boolean {
  const evening = tonightEveningBounds();
  const overlap = windowOverlap(window, evening);
  if (!overlap) return false;
  const todayKey = getIstDateKey(new Date());
  return (
    getIstDateKey(overlap.start) === todayKey ||
    getIstDateKey(overlap.end) === todayKey
  );
}

function overlapsWeekend(window: TimeWindow): boolean {
  const startDay = getIstWeekday(window.start);
  const endDay = getIstWeekday(window.end);
  return (
    startDay === "Sat" ||
    startDay === "Sun" ||
    endDay === "Sat" ||
    endDay === "Sun"
  );
}

function sharedInterestSubtitle(
  me: SaanjhUser,
  friend: Pick<SaanjhUser, "interest_tags">
): string | null {
  const shared = intersectTags(me.interest_tags, friend.interest_tags);
  if (shared.length === 0) return null;
  const labels = tagIdsToLabels(shared).slice(0, 3);
  return `${labels.join(" + ")} overlap detected`;
}

function availabilityFromOverlap(
  best: TimeWindow | undefined,
  me: SaanjhUser,
  friend: Pick<SaanjhUser, "interest_tags">
): FriendAvailability {
  const subtitle = sharedInterestSubtitle(me, friend);

  if (!best) {
    return {
      kind: "no_overlap",
      title: "No overlap detected",
      subtitle,
    };
  }

  if (overlapsTonightEvening(best)) {
    return {
      kind: "perfect_overlap_tonight",
      title: "Perfect overlap tonight",
      subtitle,
      bestOverlapStart: best.start.toISOString(),
      bestOverlapEnd: best.end.toISOString(),
      overlapDurationMinutes: Math.round(durationMinutes(best)),
    };
  }

  if (overlapsWeekend(best)) {
    return {
      kind: "free_this_weekend",
      title: "Free this weekend",
      subtitle,
      bestOverlapStart: best.start.toISOString(),
      bestOverlapEnd: best.end.toISOString(),
      overlapDurationMinutes: Math.round(durationMinutes(best)),
    };
  }

  return {
    kind: "no_overlap",
    title: "No overlap detected",
    subtitle,
    bestOverlapStart: best.start.toISOString(),
    bestOverlapEnd: best.end.toISOString(),
    overlapDurationMinutes: Math.round(durationMinutes(best)),
  };
}

type ScheduleUser = Pick<
  SaanjhUser,
  "interest_tags" | "calendar_connected" | "manual_schedule"
>;

export async function fetchFreeWindows(user: SaanjhUser): Promise<TimeWindow[]> {
  // Friends planning is calendar-only — see schedule.ts. A user without
  // Google Calendar connected returns an empty event list, which surfaces
  // upstream as an empty free-window list and the "calendar required" UI.
  const dayStart = startOfTodayIST();
  const dayEnd = endOfTodayIST();
  const events = await getCalendarOnlyEvents(user, HOURS_AHEAD);
  return findFreeWindowsInRange(
    events,
    dayStart,
    dayEnd,
    MIN_OVERLAP_MINUTES
  );
}

export async function detectAvailability(
  me: SaanjhUser,
  friend: ScheduleUser
): Promise<FriendAvailability> {
  // Friends planning requires Google Calendar on BOTH sides — manual schedule
  // is Home-only. Surface clear nudge states when either user is missing it.
  const friendHasCalendar = userHasCalendarSource(friend);
  const meHasCalendar = userHasCalendarSource(me);

  if (!friendHasCalendar && !meHasCalendar) {
    return {
      kind: "both_calendar_not_linked",
      title: "Calendars not connected",
      subtitle:
        "Joint plans need Google Calendar connected on both sides. Send your friend a nudge to connect.",
    };
  }

  if (!friendHasCalendar) {
    return {
      kind: "friend_calendar_not_linked",
      title: "Friend hasn't connected calendar",
      subtitle:
        "Waiting for your friend to connect Google Calendar so we can find overlap.",
    };
  }

  if (!meHasCalendar) {
    return {
      kind: "my_calendar_not_linked",
      title: "Connect your calendar",
      subtitle:
        "Joint plans need Google Calendar connected. Manual entries don't count here.",
    };
  }

  const [myFree, friendFree] = await Promise.all([
    fetchFreeWindows(me),
    fetchFreeWindows(friend as SaanjhUser),
  ]);

  const overlaps = mergeOverlappingWindows(
    clipWindowsToCalendarDayIST(intersectFreeWindows(myFree, friendFree))
  );
  const best = overlaps.reduce<TimeWindow | undefined>(
    (longest, window) =>
      !longest || durationMinutes(window) > durationMinutes(longest)
        ? window
        : longest,
    undefined
  );
  return availabilityFromOverlap(best, me, friend);
}
