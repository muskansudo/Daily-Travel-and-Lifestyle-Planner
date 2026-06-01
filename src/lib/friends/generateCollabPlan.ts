import { generatePlan, type Plan } from "@/lib/ai/plan";
import { retrieveVenues } from "@/lib/ai/rag";
import { splitPlanWindows } from "@/lib/calendar/events";
import type { CalendarEvent } from "@/lib/calendar/events";
import { istTodayAtHHMM } from "@/lib/calendar/manualEvents";
import { getMergedScheduleEvents } from "@/lib/calendar/schedule";
import { DEFAULT_BIAS_LATLNG } from "@/lib/constants/venues";
import {
  collabDietaryTags,
  collabInterestTags,
  computeEnergyAlignmentPercent,
  intersectTags,
} from "@/lib/friends/alignment";
import {
  formatDurationLabel,
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
const MAX_PLAN_WINDOW_MINUTES = 180;
const MAX_WINDOWS_PER_REQUEST = 4;
const HOURS_AHEAD = 24;

function durationMinutes(window: TimeWindow): number {
  return Math.round((window.end.getTime() - window.start.getTime()) / 60_000);
}

function emptyPlan(): CollabPlanBody {
  return { stops: [], summary: "", aiGenerated: false };
}

function toCollabPlanBody(plan: Plan): CollabPlanBody {
  return {
    stops: plan.stops,
    summary: plan.summary,
    aiGenerated: plan.aiGenerated,
  };
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

  const energyAlignmentPercent = computeEnergyAlignmentPercent(
    me.interest_tags,
    friend.interest_tags
  );

  const sharedWindows = await getTodaySharedFreeWindows(me, friend);
  const chunks = splitPlanWindows(
    sharedWindows,
    MAX_PLAN_WINDOW_MINUTES,
    MIN_WINDOW_MINUTES
  );

  if (chunks.length === 0) {
    const events = await buildMergedCollabEvents(me, friend);
    return {
      friendId: friend.id,
      windows: [],
      events,
      compatibility: {
        energyAlignmentPercent,
        sharedInterestLabels: tagIdsToLabels(sharedInterestTags),
        sharedLifestyleLabels: tagIdsToLabels(sharedLifestyleTags),
        sharedDietaryLabels: tagIdsToLabels(sharedDietaryTags),
        friendDisplayName: friend.display_name,
      },
      debug: {
        totalWindows: 0,
        plannedWindows: 0,
        reason: "no_shared_windows",
        ragTopK: RAG_TOP_K,
      },
    };
  }

  const windowsWithMeta = chunks.map((window) => ({
    window,
    status: windowStatus(window),
    rangeLabel: formatWindowRangeIST(window),
    durationMinutes: durationMinutes(window),
  }));

  const planable = windowsWithMeta.filter((w) => w.status !== "past");
  const toPlan = planable.slice(0, MAX_WINDOWS_PER_REQUEST);
  const capped = planable.length > MAX_WINDOWS_PER_REQUEST;

  const usedVenueIds = new Set<string>();
  const plannedByStart = new Map<number, CollabPlannedWindow>();
  let plannedCount = 0;

  const friendName = friend.display_name?.trim() || "your friend";

  for (const entry of toPlan) {
    const { window, status, rangeLabel, durationMinutes: mins } = entry;
    const biasPoint = DEFAULT_BIAS_LATLNG;

    const rawCandidates = await retrieveVenues({
      dietaryTags,
      interestTags,
      windowStart: window.start,
      windowEnd: window.end,
      biasLat: biasPoint.lat,
      biasLng: biasPoint.lng,
      topK: RAG_TOP_K + usedVenueIds.size,
    });

    const candidates = rawCandidates
      .filter((c) => !usedVenueIds.has(c.venue.id))
      .slice(0, RAG_TOP_K);

    let plan: CollabPlanBody = emptyPlan();
    if (candidates.length > 0) {
      const generated = await generatePlan(candidates, {
        freeWindow: window,
        vibes: [],
        collaborative: { friendDisplayName: friendName },
      });
      plan = toCollabPlanBody(generated);
      for (const stop of generated.stops) {
        usedVenueIds.add(stop.venueId);
      }
      if (plan.stops.length > 0) plannedCount += 1;
    }

    plannedByStart.set(window.start.getTime(), {
      freeWindow: {
        start: window.start.toISOString(),
        end: window.end.toISOString(),
      },
      plan,
      candidatesCount: candidates.length,
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

  const events = await buildMergedCollabEvents(me, friend);

  return {
    friendId: friend.id,
    windows,
    events,
    compatibility: {
      energyAlignmentPercent,
      sharedInterestLabels: tagIdsToLabels(sharedInterestTags),
      sharedLifestyleLabels: tagIdsToLabels(sharedLifestyleTags),
      sharedDietaryLabels: tagIdsToLabels(sharedDietaryTags),
      friendDisplayName: friend.display_name,
    },
    debug: {
      totalWindows: windows.length,
      plannedWindows: plannedCount,
      ragTopK: RAG_TOP_K,
      ...(capped ? { cappedAt: MAX_WINDOWS_PER_REQUEST } : {}),
    },
  };
}
