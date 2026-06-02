// Friends — joint plan generation.
//
// Architecture (matching Home v2):
//
//   1. Calendar-only schedule source. Both users must have Google Calendar
//      connected. Manual entries on the user record are deliberately ignored
//      (manual is Home-only). If either side lacks calendar → empty windows,
//      reason: "calendar_required".
//
//   2. Today-only scoping. HOURS_AHEAD=24 caps the look-forward to the rest
//      of today IST. Tomorrow is out of scope.
//
//   3. Per-window slot allocation — allocateSlots() carves human-shaped
//      slots (60–90min, 5-min boundaries, busy-aware) inside each shared
//      free window.
//
//   4. Per-slot RAG retrieval with time-of-day HARD FILTER + category
//      exclusion (for day-wide variety). Interest-aware carve-out lets
//      cafes/bars/etc repeat when both users explicitly share that interest.
//
//   5. Friend-default fallback: when the two users share ZERO interests,
//      retrieval is restricted to entertainment + restaurant + bar + cafe.
//      Movies, bowling, food, drinks — the categories friends actually do
//      together when "you both like X" isn't available.
//
//   6. Per-slot L3 generation tells the LLM it's planning for two people
//      (the "collaborative" prompt branch).
//
//   7. Final audit: any LLM-picked stop overlapping a busy interval (from
//      either calendar) is dropped. Three layers of defence — slot allocator
//      hard-guards, the LLM constraint, this audit.

import { generatePlanForSlot, allocateSlots } from "@/lib/ai/plan";
import { retrieveVenues } from "@/lib/ai/rag";
import {
  buildBusyIntervals,
  hhmmToDateInWindow,
  overlapsAnyBusy,
  type CalendarEvent,
} from "@/lib/calendar/events";
import { istTodayAtHHMM } from "@/lib/calendar/manualEvents";
import {
  getCalendarOnlyEvents,
  userHasCalendarSource,
} from "@/lib/calendar/schedule";
import {
  bucketForHour,
  DEFAULT_BIAS_LATLNG,
  repeatableCategories,
} from "@/lib/constants/venues";
import {
  collabAllowedCategories,
  collabDietaryTags,
  collabInterestTags,
  computeEnergyAlignmentPercent,
  intersectTags,
} from "@/lib/friends/alignment";
import {
  formatWindowRangeIST,
  getTodaySharedFreeWindows,
  type TimeWindow,
  windowStatus,
} from "@/lib/friends/availability";
import { tagIdsToLabels } from "@/lib/friends/tagLabels";
import type {
  CollabPlanBody,
  CollabPlanGenerateResponse,
  CollabPlannedWindow,
  CollabSerializedCalendarEvent,
  SharedWindowStatus,
} from "@/lib/types/friends";
import type { SaanjhUser } from "@/lib/types/user";

const RAG_TOP_K = 8;
const MAX_WINDOWS_PER_REQUEST = 4;
// Day-wide AI venue cap across all windows in one request.
const MAX_TOTAL_STOPS = 5;
// Calendar lookahead for the JOINT availability detector. Today-only —
// matches the Home tab default and keeps the demo flow deterministic.
const HOURS_AHEAD = 24;

function durationMinutes(window: TimeWindow): number {
  return Math.round((window.end.getTime() - window.start.getTime()) / 60_000);
}

function emptyPlan(): CollabPlanBody {
  return { stops: [], summary: "", aiGenerated: false };
}

function serialiseEvents(
  events: CalendarEvent[]
): CollabSerializedCalendarEvent[] {
  return events
    .filter((event) => !event.allDay)
    .map((event) => ({
      id: event.id,
      title: event.title,
      start: event.start.toISOString(),
      end: event.end.toISOString(),
      location: event.location,
      allDay: event.allDay,
    }))
    .sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    );
}

function clipEventsToToday(events: CalendarEvent[]): CalendarEvent[] {
  const start = istTodayAtHHMM("00:00");
  const end = istTodayAtHHMM("23:59");

  return events.filter((event) => {
    if (event.allDay) return false;
    return event.end > start && event.start < end;
  });
}

async function buildMergedCollabEvents(
  me: SaanjhUser,
  friend: SaanjhUser
): Promise<{
  events: CalendarEvent[];
  serialised: CollabSerializedCalendarEvent[];
}> {
  // Calendar-only — manual entries are Home-only and never reach this path.
  const [myEvents, friendEvents] = await Promise.all([
    getCalendarOnlyEvents(me, HOURS_AHEAD),
    getCalendarOnlyEvents(friend, HOURS_AHEAD),
  ]);

  const meLabel = me.display_name?.trim() || "You";
  const friendLabel = friend.display_name?.trim() || "Friend";

  const tagged: CalendarEvent[] = [
    ...clipEventsToToday(myEvents).map((event) => ({
      ...event,
      id: `me-${event.id}`,
      title: `${meLabel}: ${event.title}`,
    })),
    ...clipEventsToToday(friendEvents).map((event) => ({
      ...event,
      id: `friend-${event.id}`,
      title: `${friendLabel}: ${event.title}`,
    })),
  ];

  return { events: tagged, serialised: serialiseEvents(tagged) };
}

function buildTitle(
  friend: SaanjhUser,
  windows: CollabPlannedWindow[]
): string {
  const friendName = friend.display_name?.trim() || "your friend";
  const withStops = windows.find((w) => w.plan.stops.length > 0);
  if (withStops?.plan.summary?.trim()) {
    return withStops.plan.summary.trim();
  }
  return `Joint plan with ${friendName}`;
}

export function collabGenerateTitle(
  friend: SaanjhUser,
  windows: CollabPlannedWindow[]
): string {
  return buildTitle(friend, windows);
}

export async function generateCollabPlan(
  me: SaanjhUser,
  friend: SaanjhUser
): Promise<CollabPlanGenerateResponse> {
  const sharedInterestTags = intersectTags(
    me.interest_tags,
    friend.interest_tags
  );
  const sharedLifestyleTags = intersectTags(
    me.lifestyle_tags,
    friend.lifestyle_tags
  );
  const sharedDietaryTags = intersectTags(me.dietary_tags, friend.dietary_tags);

  const interestTags = collabInterestTags(
    me.interest_tags,
    friend.interest_tags
  );
  const dietaryTags = collabDietaryTags(me.dietary_tags, friend.dietary_tags);
  const allowedCategories = collabAllowedCategories(
    me.interest_tags,
    friend.interest_tags
  );

  const energyAlignmentPercent = computeEnergyAlignmentPercent(
    me.interest_tags,
    friend.interest_tags
  );

  const baseCompatibility = {
    energyAlignmentPercent,
    sharedInterestLabels: tagIdsToLabels(sharedInterestTags),
    sharedLifestyleLabels: tagIdsToLabels(sharedLifestyleTags),
    sharedDietaryLabels: tagIdsToLabels(sharedDietaryTags),
    friendDisplayName: friend.display_name,
  };

  // ---- Gate: both users must have Google Calendar connected ----
  if (!userHasCalendarSource(me) || !userHasCalendarSource(friend)) {
    return {
      friendId: friend.id,
      windows: [],
      events: [],
      compatibility: baseCompatibility,
      debug: {
        totalWindows: 0,
        plannedWindows: 0,
        reason: "calendar_required",
        ragTopK: RAG_TOP_K,
      },
    };
  }

  const sharedWindows = await getTodaySharedFreeWindows(me, friend);

  if (sharedWindows.length === 0) {
    const { serialised } = await buildMergedCollabEvents(me, friend);
    return {
      friendId: friend.id,
      windows: [],
      events: serialised,
      compatibility: baseCompatibility,
      debug: {
        totalWindows: 0,
        plannedWindows: 0,
        reason: "no_shared_windows",
        ragTopK: RAG_TOP_K,
      },
    };
  }

  const windowsWithMeta = sharedWindows.map((window) => ({
    window,
    status: windowStatus(window),
    rangeLabel: formatWindowRangeIST(window),
    durationMinutes: durationMinutes(window),
  }));

  const planable = windowsWithMeta.filter((w) => w.status !== "past");
  const toPlan = planable.slice(0, MAX_WINDOWS_PER_REQUEST);
  const capped = planable.length > MAX_WINDOWS_PER_REQUEST;

  // Canonical busy intervals across BOTH users' calendars — used by the
  // slot allocator AND the final audit pass.
  const { events: combinedEvents, serialised } =
    await buildMergedCollabEvents(me, friend);
  const busyIntervals = buildBusyIntervals(combinedEvents);

  const friendName = friend.display_name?.trim() || "your friend";

  // Day-wide state for diversity + dedupe
  const usedCategories: string[] = [];
  const usedVenueIds = new Set<string>();
  // Repeatable categories driven by interests the PAIR shares. A cafe-loving
  // pair sees multiple cafes; a no-overlap pair gets the default rule.
  const repeatableCats = repeatableCategories(sharedInterestTags);
  let stopsBudget = MAX_TOTAL_STOPS;

  const plannedByStart = new Map<number, CollabPlannedWindow>();
  let plannedCount = 0;

  for (const entry of toPlan) {
    const { window, status, rangeLabel, durationMinutes: mins } = entry;
    if (stopsBudget <= 0) {
      plannedByStart.set(window.start.getTime(), {
        freeWindow: {
          start: window.start.toISOString(),
          end: window.end.toISOString(),
        },
        plan: emptyPlan(),
        candidatesCount: 0,
        status,
        rangeLabel,
        durationMinutes: mins,
        skippedReason: "cap",
      });
      continue;
    }

    // Carve human-shaped slots inside this shared free window
    const slots = allocateSlots(window, busyIntervals, stopsBudget);
    if (slots.length === 0) {
      plannedByStart.set(window.start.getTime(), {
        freeWindow: {
          start: window.start.toISOString(),
          end: window.end.toISOString(),
        },
        plan: emptyPlan(),
        candidatesCount: 0,
        status,
        rangeLabel,
        durationMinutes: mins,
      });
      continue;
    }

    const stops: CollabPlanBody["stops"] = [];
    let totalCandidatesSeen = 0;

    for (const slot of slots) {
      if (stopsBudget <= 0) break;

      // Categories to exclude for THIS slot: previously used, minus any
      // that are explicitly repeatable for the shared interests.
      const excludeCategories = usedCategories.filter(
        (c) => !(repeatableCats as Set<string>).has(c)
      );

      const candidates = await retrieveVenues({
        dietaryTags,
        interestTags,
        windowStart: slot.startDate,
        windowEnd: slot.endDate,
        biasLat: DEFAULT_BIAS_LATLNG.lat,
        biasLng: DEFAULT_BIAS_LATLNG.lng,
        allowedCategories,
        excludeCategories,
        timeOfDay: bucketForHour(slot.startDate),
        topK: RAG_TOP_K + usedVenueIds.size,
      });

      const fresh = candidates.filter((c) => !usedVenueIds.has(c.venue.id));
      if (fresh.length === 0) continue;

      totalCandidatesSeen += fresh.length;

      const stop = await generatePlanForSlot(fresh, slot, [], {
        friendDisplayName: friendName,
      });
      if (!stop) continue;

      // Final overlap audit (defence-in-depth)
      const stopStart = hhmmToDateInWindow(stop.startTime, slot.startDate);
      const stopEnd = hhmmToDateInWindow(stop.endTime, slot.startDate);
      if (overlapsAnyBusy(stopStart, stopEnd, busyIntervals)) continue;

      stops.push(stop);
      usedVenueIds.add(stop.venueId);
      usedCategories.push(stop.category);
      stopsBudget -= 1;
    }

    if (stops.length > 0) plannedCount += 1;

    plannedByStart.set(window.start.getTime(), {
      freeWindow: {
        start: window.start.toISOString(),
        end: window.end.toISOString(),
      },
      plan: {
        stops,
        summary: "",
        aiGenerated: stops.length > 0,
      },
      candidatesCount: totalCandidatesSeen,
      status,
      rangeLabel,
      durationMinutes: mins,
    });
  }

  const windows: CollabPlannedWindow[] = windowsWithMeta.map((entry) => {
    const { window, status, rangeLabel, durationMinutes: mins } = entry;
    const key = window.start.getTime();
    const planned = plannedByStart.get(key);
    if (planned) return planned;

    let skippedReason: "past" | "cap" | undefined;
    if (status === "past") {
      skippedReason = "past";
    } else if (
      capped &&
      planable.findIndex((p) => p.window.start.getTime() === key) >=
        MAX_WINDOWS_PER_REQUEST
    ) {
      skippedReason = "cap";
    }

    return {
      freeWindow: {
        start: window.start.toISOString(),
        end: window.end.toISOString(),
      },
      plan: emptyPlan(),
      candidatesCount: 0,
      status: status as SharedWindowStatus,
      rangeLabel,
      durationMinutes: mins,
      skippedReason,
    };
  });

  return {
    friendId: friend.id,
    windows,
    events: serialised,
    compatibility: baseCompatibility,
    debug: {
      totalWindows: windows.length,
      plannedWindows: plannedCount,
      ragTopK: RAG_TOP_K,
      ...(capped ? { cappedAt: MAX_WINDOWS_PER_REQUEST } : {}),
    },
  };
}
