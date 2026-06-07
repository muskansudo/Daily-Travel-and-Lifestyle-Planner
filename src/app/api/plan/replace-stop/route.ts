// DROP IN AT: src/app/api/plan/replace-stop/route.ts (NEW FILE)
//
// API: POST /api/plan/replace-stop
//
// Per-slot regeneration. The user rejected one specific venue from their plan
// ("I don't want to go to this park"). This endpoint re-runs L2 retrieval +
// L3 generation for that ONE slot only, excluding any venues the user has
// already rejected in this session.
//
// Design notes:
//   - Does NOT regenerate the whole day. The rest of the timeline is preserved
//     client-side.
//   - Excludes the venue being replaced PLUS any previously rejected venues
//     PLUS the venues currently used in other slots (day-wide dedupe). The
//     client passes the full excludeVenueIds list.
//   - No category exclusion. When the user rejects a specific venue, we let
//     them get any category that fits the time slot. This is intentional — a
//     park rejection might mean "I don't want outdoor right now" and a cafe
//     swap would serve them better than a different park.
//   - Returns { newStop: null, reason } when no alternative can be found. The
//     client surfaces this as an inline message; the original stop stays put.
//
// Request:
//   {
//     venueIdToReplace: string,        // for logging only — caller already
//                                       // includes it in excludeVenueIds
//     slot: { startTime: HH:MM, endTime: HH:MM },
//     excludeVenueIds: string[],
//     vibes?: string[],
//     manualEntries?: ManualScheduleEntry[],
//     allowedNeighborhoods?: string[],
//     allowedCategories?: string[],
//   }
//
// Response (200):
//   { newStop: PlanStop | null, reason?: string }

import { NextResponse } from "next/server";
import { getOrCreateDbUser, requireAuth } from "@/lib/auth";
import {
  isPlanningQuietHours,
  planningQuietHoursPayload,
} from "@/lib/planning/quietHours";
import { retrieveVenues } from "@/lib/ai/rag";
import {
  generatePlanForSlot,
  type PlanStop,
  type TimeSlot,
} from "@/lib/ai/plan";
import {
  buildBusyIntervals,
  hhmmToDateInWindow,
  overlapsAnyBusy,
  getUpcomingEvents,
} from "@/lib/calendar/events";
import {
  manualEntriesToEvents,
  istTodayAtHHMM,
} from "@/lib/calendar/manualEvents";
import { bucketForHour, DEFAULT_BIAS_LATLNG } from "@/lib/constants/venues";

const RAG_TOP_K = 8;
const DEFAULT_HOURS_AHEAD = 16;

interface ReplaceRequest {
  venueIdToReplace: string;
  slot: { startTime: string; endTime: string };
  excludeVenueIds: string[];
  vibes: string[];
  manualEntries: Array<{
    id: string;
    startTime: string;
    endTime: string;
    activity: string;
    explanation?: string;
  }>;
  allowedNeighborhoods?: string[];
  allowedCategories?: string[];
  hoursAhead?: number;
}

export async function POST(request: Request) {
  const clerkId = await requireAuth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ReplaceRequest;
  try {
    body = (await request.json()) as ReplaceRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    !body.slot?.startTime ||
    !body.slot?.endTime ||
    !Array.isArray(body.excludeVenueIds)
  ) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (isPlanningQuietHours()) {
    return NextResponse.json(planningQuietHoursPayload(), { status: 403 });
  }

  try {
    const user = await getOrCreateDbUser(clerkId);

    // Reconstruct the slot as real Date objects in IST. Replace operations
    // always target the current IST day — same assumption as the rest of the
    // app (see saveDailyPlan keyed on todayKey).
    const slot: TimeSlot = {
      startTime: body.slot.startTime,
      endTime: body.slot.endTime,
      startDate: istTodayAtHHMM(body.slot.startTime),
      endDate: istTodayAtHHMM(body.slot.endTime),
    };

    // Rebuild busy intervals so the final overlap audit still has teeth.
    // Manual entries override calendar (same rule as /api/plan/generate).
    const hoursAhead = body.hoursAhead ?? DEFAULT_HOURS_AHEAD;
    const manualEvents = manualEntriesToEvents(body.manualEntries ?? []);
    const calendarEvents =
      manualEvents.length > 0
        ? []
        : await getUpcomingEvents(user, { hoursAhead });
    const events = manualEvents.length > 0 ? manualEvents : calendarEvents;
    const busyIntervals = buildBusyIntervals(events);

    // L2 retrieval — same call as the orchestrator, but with the user's reject
    // list folded into a post-filter. We don't pass excludeCategories: the user
    // explicitly rejected a venue, give them anything that fits the slot.
    const candidates = await retrieveVenues({
      dietaryTags: user.dietary_tags ?? [],
      interestTags: user.interest_tags ?? [],
      moodVibes: body.vibes && body.vibes.length > 0 ? body.vibes : undefined,
      windowStart: slot.startDate,
      windowEnd: slot.endDate,
      biasLat: DEFAULT_BIAS_LATLNG.lat,
      biasLng: DEFAULT_BIAS_LATLNG.lng,
      allowedCategories: body.allowedCategories,
      allowedNeighborhoods: body.allowedNeighborhoods,
      excludeCategories: [],
      timeOfDay: bucketForHour(slot.startDate),
      topK: RAG_TOP_K + body.excludeVenueIds.length,
    });

    const excluded = new Set(body.excludeVenueIds);
    const fresh = candidates.filter((c) => !excluded.has(c.venue.id));

    if (fresh.length === 0) {
      return NextResponse.json({
        newStop: null,
        reason: "no_alternatives",
      });
    }

    // L3 generation for the single slot.
    const stop = await generatePlanForSlot(fresh, slot, body.vibes ?? []);
    if (!stop) {
      return NextResponse.json({
        newStop: null,
        reason: "groq_failed",
      });
    }

    // Final overlap audit — same defence-in-depth guard the orchestrator uses.
    const stopStart = hhmmToDateInWindow(stop.startTime, slot.startDate);
    const stopEnd = hhmmToDateInWindow(stop.endTime, slot.startDate);
    if (overlapsAnyBusy(stopStart, stopEnd, busyIntervals)) {
      return NextResponse.json({
        newStop: null,
        reason: "overlap_busy",
      });
    }

    const newStop: PlanStop = stop;
    return NextResponse.json({ newStop });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Replace failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
