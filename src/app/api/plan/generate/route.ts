// API: POST /api/plan/generate
//
// The orchestrator. Builds the day's plan as a sequence of carefully-curated
// venue stops between the user's busy blocks (manual entries OR Google
// Calendar events — manual wins when present).
//
// Design doc v2 architecture:
//
//   1. Read events. Manual entries override calendar; no merging when manual is
//      provided. Build canonical busy intervals (with overnight sleep mirror).
//
//   2. Find free windows (≥60 min). Rank by duration, keep the top 3 — fat
//      windows beat tiny pre-office gaps.
//
//   3. For each prioritized window, carve human-shaped slots (60-90 min, 5-min
//      boundaries, busy-aware). Scales with window length: 1 stop for short,
//      up to 4 for a wide-open day.
//
//   4. For each slot, run L2 RAG retrieval with time-of-day as a HARD FILTER
//      and already-used categories as exclusions (with interest-aware
//      carve-outs). Walk fallback chain on empty.
//
//   5. For each slot, run L3 Groq generation to pick one venue from candidates.
//
//   6. Final audit pass: drop any stop that overlaps a busy interval. Three
//      layers of defence — slot allocator + LLM constraint + this filter.
//
// Two request modes:
//
//   1. JSON  (Content-Type: application/json)
//   2. Multipart (Content-Type: multipart/form-data) — when user uploads a vibe image
//
// Response (200):
//   {
//     windows: [{ freeWindow, plan, candidatesCount }, ...],
//     events:  CalendarEvent[],
//     mood:    MoodResult | null,
//     debug:   { ragTopK, reason?, totalWindows, plannedWindows, source }
//   }

import { NextResponse } from "next/server";
import { getOrCreateDbUser, requireAuth } from "@/lib/auth";
import { extractMoodFromImage, type MoodResult } from "@/lib/ai/mood";
import { retrieveVenues } from "@/lib/ai/rag";
import {
  allocateSlots,
  generatePlanForSlot,
  type Plan,
  type PlanStop,
  type TimeSlot,
} from "@/lib/ai/plan";
import {
  buildBusyIntervals,
  findFreeWindows,
  getUpcomingEvents,
  hhmmToDateInWindow,
  overlapsAnyBusy,
  pickPrioritizedWindows,
  type BusyInterval,
  type CalendarEvent,
} from "@/lib/calendar/events";
import {
  manualEntriesToEvents,
  mergeScheduleEvents,
} from "@/lib/calendar/manualEvents";
import {
  bucketForHour,
  DEFAULT_BIAS_LATLNG,
  repeatableCategories,
} from "@/lib/constants/venues";
import { generateOutfit } from "@/lib/ai/outfit";
import type { WardrobeOccasionId } from "@/lib/constants/wardrobe";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DEFAULT_HOURS_AHEAD = 16;
const RAG_TOP_K = 8;
// SRS rule: ignore free windows under 60 minutes — can't host a 60-min slot.
const MIN_WINDOW_MINUTES = 60;
// Cap on planned windows. Combined with the day-wide MAX_TOTAL_STOPS budget,
// keeps Groq cost predictable on packed days.
const MAX_PLANNED_WINDOWS = 3;
// Day-wide AI venue cap. Total stops across all windows in one request.
const MAX_TOTAL_STOPS = 5;

interface OrchestratorOptions {
  allowedNeighborhoods?: string[];
  allowedCategories?: string[];
  hoursAhead?: number;
  vibes?: string[];
  manualEntries?: Array<{
    id: string;
    startTime: string;
    endTime: string;
    activity: string;
    explanation?: string;
    time?: string;
  }>;
  imageBuffer?: Buffer;
  imageMimeType?: string;
}

interface PlannedWindow {
  freeWindow: { start: Date; end: Date };
  plan: Plan;
  candidatesCount: number;
}

export async function POST(request: Request) {
  const clerkId = await requireAuth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const options = await parseRequest(request);
    const user = await getOrCreateDbUser(clerkId);

    // L1 — mood (only if vibe image provided). Shared across all windows.
    let mood: MoodResult | null = null;
    if (options.imageBuffer && options.imageMimeType) {
      mood = await extractMoodFromImage(options.imageBuffer, options.imageMimeType);
    }

    // ---- Source-of-truth selection (design doc section 7) ----
    // Manual wins. If the user entered ANY manual events, ignore Google
    // Calendar entirely. Predictable for demo, eliminates surprise calls
    // showing up on the timeline.
    const hoursAhead = options.hoursAhead ?? DEFAULT_HOURS_AHEAD;
    const manualEvents = manualEntriesToEvents(options.manualEntries ?? []);
    const calendarEvents =
      manualEvents.length > 0
        ? []
        : await getUpcomingEvents(user, { hoursAhead });
    const events =
      manualEvents.length > 0
        ? manualEvents
        : mergeScheduleEvents(calendarEvents, manualEvents);
    const scheduleSource: "manual" | "calendar" | "none" =
      manualEvents.length > 0
        ? "manual"
        : calendarEvents.length > 0
          ? "calendar"
          : "none";

    // Canonical busy intervals — used by allocateSlots inside generatePlan
    // AND by the final overlap audit pass.
    const busyIntervals = buildBusyIntervals(events);

    // ---- Empty-input handling (design doc scenario D) ----
    // No manual + no calendar connection = nothing to anchor a plan against.
    // The Home page renders a "connect your calendar or add what you're doing"
    // empty state for this case.
    if (events.length === 0 && !user.calendar_connected) {
      return NextResponse.json({
        windows: [],
        events: [],
        mood,
        outfit: null,
        debug: {
          ragTopK: RAG_TOP_K,
          reason: "no_anchor",
          totalWindows: 0,
          plannedWindows: 0,
          source: scheduleSource,
        },
      });
    }

    // ---- Free window discovery + prioritization ----
    const allFreeWindows = findFreeWindows(events, hoursAhead, MIN_WINDOW_MINUTES);
    if (allFreeWindows.length === 0) {
      return NextResponse.json({
        windows: [],
        events: serialiseEvents(events),
        mood,
        outfit: null,
        debug: {
          ragTopK: RAG_TOP_K,
          reason: "no_free_window",
          totalWindows: 0,
          plannedWindows: 0,
          source: scheduleSource,
        },
      });
    }

    // Rank free windows by duration DESC, keep the top MAX_PLANNED_WINDOWS,
    // then re-sort chronologically so the day still reads left-to-right.
    const windowsToPlan = pickPrioritizedWindows(allFreeWindows, MAX_PLANNED_WINDOWS);

    const effectiveVibes = resolveVibes(mood, options.vibes);
    const userInterests = user.interest_tags ?? [];
    const repeatableCats = repeatableCategories(userInterests);

    // Day-wide state
    const usedCategories: string[] = []; // for diversity exclusion
    const usedVenueIds = new Set<string>(); // for venue dedupe across slots
    let stopsBudget = MAX_TOTAL_STOPS;
    const planned: PlannedWindow[] = [];

    for (const window of windowsToPlan) {
      if (stopsBudget <= 0) break;

      // Carve slots for this window. allocateSlots scales count by window
      // length; budget caps total day stops.
      const slots = allocateSlots(window, busyIntervals, stopsBudget);
      if (slots.length === 0) {
        planned.push({
          freeWindow: window,
          plan: emptyPlan(),
          candidatesCount: 0,
        });
        continue;
      }

      const biasPoint = pickBiasPoint(events, window.start);
      const stops: PlanStop[] = [];
      let totalCandidatesSeen = 0;

      // Per-slot retrieval + generation.
      for (const slot of slots) {
        if (stopsBudget <= 0) break;

        // Categories to exclude for THIS slot: previously used categories,
        // MINUS any that are explicitly repeatable for this user's interests.
        // (repeatableCats is a Set<VenueCategoryId>, so .has accepts any
        // string at runtime — the cast appeases the strict signature.)
        const excludeCategories = usedCategories.filter(
          (c) => !(repeatableCats as Set<string>).has(c)
        );

        const candidates = await retrieveVenues({
          dietaryTags: user.dietary_tags ?? [],
          interestTags: userInterests,
          moodVibes: effectiveVibes.length > 0 ? effectiveVibes : undefined,
          windowStart: slot.startDate,
          windowEnd: slot.endDate,
          biasLat: biasPoint.lat,
          biasLng: biasPoint.lng,
          allowedCategories: options.allowedCategories,
          allowedNeighborhoods: options.allowedNeighborhoods,
          excludeCategories,
          timeOfDay: bucketForHour(slot.startDate),
          topK: RAG_TOP_K + usedVenueIds.size,
        });

        // Drop venues already used today (day-wide dedupe).
        const fresh = candidates.filter((c) => !usedVenueIds.has(c.venue.id));
        if (fresh.length === 0) continue;

        totalCandidatesSeen += fresh.length;

        const stop = await generatePlanForSlot(fresh, slot, effectiveVibes);
        if (!stop) continue;

        // Final audit: confirm the stop doesn't overlap any busy interval.
        // The slot allocator already guards this, but the SRS asks for a
        // final defence-in-depth filter at the orchestrator level.
        const stopStart = hhmmToDateInWindow(stop.startTime, slot.startDate);
        const stopEnd = hhmmToDateInWindow(stop.endTime, slot.startDate);
        if (overlapsAnyBusy(stopStart, stopEnd, busyIntervals)) continue;

        stops.push(stop);
        usedVenueIds.add(stop.venueId);
        usedCategories.push(stop.category);
        stopsBudget -= 1;
      }

      planned.push({
        freeWindow: window,
        plan: {
          stops,
          summary: "",
          aiGenerated: stops.length > 0,
        },
        candidatesCount: totalCandidatesSeen,
      });
    }

    // L3 (closet) — one Outfit of the Day for the whole plan. This is a
    // day-level recommendation, not per-slot. We derive an occasion hint from
    // the day's events/stops (a work meeting => work, a gym block => workout);
    // the mood vibes drive the rest inside generateOutfit. Returns null when
    // the closet can't dress the day, and the Home OutfitCard renders its own
    // empty state for that.
    const allStops = planned.flatMap((entry) => entry.plan.stops);
    const outfit = await generateOutfit(user.id, {
      vibes: effectiveVibes,
      occasionHint: deriveOccasionHint(events, allStops),
    });

    return NextResponse.json({
      windows: planned.map((entry) => ({
        ...entry,
        freeWindow: {
          start: entry.freeWindow.start.toISOString(),
          end: entry.freeWindow.end.toISOString(),
        },
      })),
      events: serialiseEvents(events),
      mood,
      outfit,
      debug: {
        ragTopK: RAG_TOP_K,
        totalWindows: allFreeWindows.length,
        plannedWindows: planned.length,
        cappedAt: MAX_PLANNED_WINDOWS,
        maxTotalStops: MAX_TOTAL_STOPS,
        source: scheduleSource,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Plan generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---- Helpers ----

async function parseRequest(request: Request): Promise<OrchestratorOptions> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("image");

    let imageBuffer: Buffer | undefined;
    let imageMimeType: string | undefined;
    if (file instanceof File) {
      if (!file.type.startsWith("image/")) {
        throw new Error("Uploaded file must be an image");
      }
      if (file.size > MAX_IMAGE_BYTES) {
        throw new Error("Image must be under 5 MB");
      }
      imageBuffer = Buffer.from(await file.arrayBuffer());
      imageMimeType = file.type;
    }

    return {
      allowedNeighborhoods: parseJsonField(formData.get("allowedNeighborhoods")),
      allowedCategories: parseJsonField(formData.get("allowedCategories")),
      hoursAhead: parseNumberField(formData.get("hoursAhead")),
      vibes: parseJsonField(formData.get("vibes")),
      manualEntries: parseManualEntriesField(formData.get("manualEntries")),
      imageBuffer,
      imageMimeType,
    };
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // Empty body is fine.
  }

  return {
    allowedNeighborhoods: Array.isArray(body.allowedNeighborhoods)
      ? (body.allowedNeighborhoods as string[]).filter(
          (s) => typeof s === "string"
        )
      : undefined,
    allowedCategories: Array.isArray(body.allowedCategories)
      ? (body.allowedCategories as string[]).filter((s) => typeof s === "string")
      : undefined,
    hoursAhead:
      typeof body.hoursAhead === "number" && body.hoursAhead > 0
        ? body.hoursAhead
        : undefined,
    vibes: Array.isArray(body.vibes)
      ? (body.vibes as string[]).filter((s) => typeof s === "string")
      : undefined,
    manualEntries: parseManualEntries(body.manualEntries),
  };
}

function parseManualEntries(raw: unknown) {
  if (!Array.isArray(raw)) return undefined;

  return raw
    .map((entry) => {
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
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

function parseManualEntriesField(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  try {
    return parseManualEntries(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

function resolveVibes(
  mood: MoodResult | null,
  requestVibes?: string[]
): string[] {
  if (mood?.vibes && mood.vibes.length > 0) return mood.vibes;
  return requestVibes ?? [];
}

/**
 * Strong occasion signal for outfit selection, read off the day itself.
 * Only returns a hint for unambiguous cases — otherwise undefined, and the
 * mood vibes decide the occasion inside generateOutfit. Conservative on
 * purpose: a wrong hint is worse than none.
 */
function deriveOccasionHint(
  events: CalendarEvent[],
  stops: PlanStop[]
): WardrobeOccasionId | undefined {
  const text = [
    ...events.map((e) => e.title),
    ...stops.map((s) => `${s.category} ${s.venueName}`),
  ]
    .join(" ")
    .toLowerCase();

  const WORK =
    /\b(meeting|office|work|standup|stand-up|client|review|sync|interview|presentation|deadline|1:1)\b/;
  const WORKOUT = /\b(gym|workout|run|yoga|cycle|cycling|training|fitness|swim)\b/;
  const FESTIVE = /\b(party|dinner|date|celebration|wedding|festive|drinks|bar|pub|lounge)\b/;

  if (WORK.test(text)) return "work";
  if (WORKOUT.test(text)) return "workout";
  if (FESTIVE.test(text)) return "festive";
  return undefined;
}

function serialiseEvents(events: CalendarEvent[]) {
  return events.map((event) => ({
    id: event.id,
    title: event.title,
    start: event.start.toISOString(),
    end: event.end.toISOString(),
    location: event.location,
    allDay: event.allDay,
  }));
}

function parseJsonField(raw: FormDataEntryValue | null): string[] | undefined {
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((s) => typeof s === "string")
      : undefined;
  } catch {
    return undefined;
  }
}

function parseNumberField(raw: FormDataEntryValue | null): number | undefined {
  if (typeof raw !== "string") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Bias point for distance scoring. For Round 2 we always return the default
 * (TI Bagmane). Round 3 polish: geocode event.location to bias near the most
 * recent meeting.
 */
function pickBiasPoint(
  _events: CalendarEvent[],
  _windowStart: Date
): { lat: number; lng: number } {
  return { lat: DEFAULT_BIAS_LATLNG.lat, lng: DEFAULT_BIAS_LATLNG.lng };
}

function emptyPlan(): Plan {
  return { stops: [], summary: "", aiGenerated: false };
}
