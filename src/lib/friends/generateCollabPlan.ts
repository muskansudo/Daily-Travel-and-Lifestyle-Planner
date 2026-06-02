// Saanjh — Friends collab plan generator (rewritten, migration 009)
//
// Architecture rewrite: matches the Home tab per-slot pipeline (design doc v2,
// sections 4, 9). The old implementation used splitPlanWindows + a single
// generatePlan call per window (multi-stop, one retrieval call for all stops).
// That caused five bugs:
//
//   Bug 1: Used the OLD splitPlanWindows flow (chunked 180-min pieces) instead
//          of allocateSlots.
//   Bug 2: No time-of-day filter at retrieval — a cafe could land at 9 PM.
//   Bug 3: No category diversity tracking — cafe → cafe → cafe per day.
//   Bug 4: No final overlap-audit pass — stops could land on busy blocks.
//   Bug 5: Wrong slot architecture — multi-stop per window, not per-slot.
//
// New pipeline per shared free window:
//
//   1. allocateSlots()        — carve human-shaped slots (60-90 min, 5-min
//                               boundaries, busy-aware). Same logic as Home.
//   2. retrieveVenues()       — per slot, with time-of-day bucket as HARD
//                               FILTER + category diversity exclusion +
//                               collabAllowedCategories() for zero-overlap
//                               friend pairs.
//   3. generatePlanForSlot()  — LLM picks ONE venue per slot, collaborative
//                               prompt tells it to pick for two people.
//   4. Overlap audit          — drop any stop that lands on a busy interval.
//
// Function signature is unchanged so all UI / API callers keep working.

import { allocateSlots, generatePlanForSlot, type PlanStop } from "@/lib/ai/plan";
import { retrieveVenues } from "@/lib/ai/rag";
import type { CalendarEvent } from "@/lib/calendar/events";
import {
  buildBusyIntervals,
  hhmmToDateInWindow,
  overlapsAnyBusy,
} from "@/lib/calendar/events";
import { istTodayAtHHMM } from "@/lib/calendar/manualEvents";
import { getMergedScheduleEvents } from "@/lib/calendar/schedule";
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
const MIN_WINDOW_MINUTES = 45;
const MAX_WINDOWS_PER_REQUEST = 4;
// Day-wide venue stop cap — prevents Groq cost blowout on wide-open days.
const MAX_TOTAL_STOPS = 5;
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
): Promise<CollabSerializedCalendarEvent[]> {
  const [myEvents, friendEvents] = await Promise.all([
    getMergedScheduleEvents(me, HOURS_AHEAD),
    getMergedScheduleEvents(friend, HOURS_AHEAD),
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

  return serialiseEvents(tagged);
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
  // ---- Compatibility payload (unchanged — UI reads this for the energy badge) ----
  const sharedInterestTags = intersectTags(
    me.interest_tags,
    friend.interest_tags
  );
  const sharedLifestyleTags = intersectTags(
    me.lifestyle_tags,
    friend.lifestyle_tags
  );
  const sharedDietaryTags = intersectTags(me.dietary_tags, friend.dietary_tags);

  const energyAlignmentPercent = computeEnergyAlignmentPercent(
    me.interest_tags,
    friend.interest_tags
  );

  const compatibility = {
    energyAlignmentPercent,
    sharedInterestLabels: tagIdsToLabels(sharedInterestTags),
    sharedLifestyleLabels: tagIdsToLabels(sharedLifestyleTags),
    sharedDietaryLabels: tagIdsToLabels(sharedDietaryTags),
    friendDisplayName: friend.display_name,
  };

  // ---- Shared free windows ----
  const sharedWindows = await getTodaySharedFreeWindows(me, friend);

  if (sharedWindows.length === 0) {
    const events = await buildMergedCollabEvents(me, friend);
    return {
      friendId: friend.id,
      windows: [],
      events,
      compatibility,
      debug: {
        totalWindows: 0,
        plannedWindows: 0,
        reason: "no_shared_windows",
        ragTopK: RAG_TOP_K,
      },
    };
  }

  // ---- Busy intervals (for slot allocator + final overlap audit) ----
  // Merge both users' events into a single busy set so allocateSlots won't
  // place a collab stop during either person's meeting.
  const [myEvents, friendEvents] = await Promise.all([
    getMergedScheduleEvents(me, HOURS_AHEAD),
    getMergedScheduleEvents(friend, HOURS_AHEAD),
  ]);
  const combinedEvents = [
    ...clipEventsToToday(myEvents),
    ...clipEventsToToday(friendEvents),
  ];
  const busyIntervals = buildBusyIntervals(combinedEvents);

  // ---- RAG signal setup ----
  const dietaryTags = collabDietaryTags(me.dietary_tags, friend.dietary_tags);

  // Interest tags: shared interests drive retrieval (same as Home).
  // collabInterestTags falls back to union when zero shared — but we will
  // also pass allowedCategories from collabAllowedCategories() which overrides
  // the union with a social-category hard filter in the zero-overlap case.
  const interestTags = collabInterestTags(
    me.interest_tags,
    friend.interest_tags
  );

  // Category filter: undefined when shared interests exist (they do the work),
  // FRIEND_DEFAULT_CATEGORIES when zero overlap (hard social fallback).
  const allowedCategoriesForFallback = collabAllowedCategories(
    me.interest_tags,
    friend.interest_tags
  );

  // Category diversity: honour the same repeatableCategories logic so a
  // cafe_hopping friend pair can still get multiple cafes.
  const repeatableCats = repeatableCategories([
    ...me.interest_tags,
    ...friend.interest_tags,
  ]);

  const friendName = friend.display_name?.trim() || "your friend";

  // ---- Window filtering + metadata ----
  const validWindows = sharedWindows.filter(
    (w) => durationMinutes(w) >= MIN_WINDOW_MINUTES
  );

  const windowsWithMeta = validWindows.map((window) => ({
    window,
    status: windowStatus(window),
    rangeLabel: formatWindowRangeIST(window),
    durationMinutes: durationMinutes(window),
  }));

  const planable = windowsWithMeta.filter((w) => w.status !== "past");
  const toPlan = planable.slice(0, MAX_WINDOWS_PER_REQUEST);
  const capped = planable.length > MAX_WINDOWS_PER_REQUEST;

  // ---- Day-wide state (mirrors Home tab route.ts) ----
  const usedCategories: string[] = [];
  const usedVenueIds = new Set<string>();
  let stopsBudget = MAX_TOTAL_STOPS;

  const plannedByStart = new Map<number, CollabPlannedWindow>();
  let plannedCount = 0;

  // ---- Per-window, per-slot generation ----
  for (const entry of toPlan) {
    if (stopsBudget <= 0) break;

    const { window, status, rangeLabel, durationMinutes: mins } = entry;
    const biasPoint = DEFAULT_BIAS_LATLNG;

    // Carve slots for this window — allocateSlots respects busy intervals and
    // the day-wide stop budget.
    const slots = allocateSlots(window, busyIntervals, stopsBudget);

    if (slots.length === 0) {
      plannedByStart.set(window.start.getTime(), {
        freeWindow: {
          start: window.start.toISOString(),
          end: window.end.toISOString(),
        },
        plan: emptyPlan(),
        candidatesCount: 0,
        status: status as SharedWindowStatus,
        rangeLabel,
        durationMinutes: mins,
      });
      continue;
    }

    const stops: PlanStop[] = [];
    let totalCandidatesSeen = 0;

    for (const slot of slots) {
      if (stopsBudget <= 0) break;

      // Category exclusion: already-used categories MINUS any that are
      // repeatable for this friend pair's combined interests.
      const excludeCategories = usedCategories.filter(
        (c) => !(repeatableCats as Set<string>).has(c)
      );

      // Per-slot RAG retrieval with time-of-day hard filter.
      const rawCandidates = await retrieveVenues({
        dietaryTags,
        interestTags,
        windowStart: slot.startDate,
        windowEnd: slot.endDate,
        biasLat: biasPoint.lat,
        biasLng: biasPoint.lng,
        // Grow topK by already-used count so deduplication still yields RAG_TOP_K
        // fresh candidates for the LLM.
        topK: RAG_TOP_K + usedVenueIds.size,
        timeOfDay: bucketForHour(slot.startDate),
        excludeCategories,
        // Zero-overlap fallback: hard-filter to social categories.
        allowedCategories: allowedCategoriesForFallback,
      });

      // Drop venues already used today (day-wide dedupe).
      const candidates = rawCandidates
        .filter((c) => !usedVenueIds.has(c.venue.id))
        .slice(0, RAG_TOP_K);

      if (candidates.length === 0) continue;
      totalCandidatesSeen += candidates.length;

      const stop = await generatePlanForSlot(
        candidates,
        slot,
        [], // vibes: no mood image in collab flow — interests drive selection
        { friendDisplayName: friendName }
      );
      if (!stop) continue;

      // Final overlap audit: defence-in-depth on top of allocateSlots.
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
      status: status as SharedWindowStatus,
      rangeLabel,
      durationMinutes: mins,
    });
  }

  // ---- Assemble final windows array (all windows, including skipped) ----
  const windows: CollabPlannedWindow[] = windowsWithMeta.map((entry) => {
    const { window, status, rangeLabel, durationMinutes: mins } = entry;
    const key = window.start.getTime();
    const planned = plannedByStart.get(key);
    if (planned) return planned;

    // Window was skipped — annotate why.
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

  const events = await buildMergedCollabEvents(me, friend);

  return {
    friendId: friend.id,
    windows,
    events,
    compatibility,
    debug: {
      totalWindows: windows.length,
      plannedWindows: plannedCount,
      ragTopK: RAG_TOP_K,
      ...(capped ? { cappedAt: MAX_WINDOWS_PER_REQUEST } : {}),
    },
  };
}
