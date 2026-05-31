// API: POST /api/plan/generate
//
// The orchestrator. Looks at the user's whole calendar day, finds every free
// window long enough to fit a plan, and generates one mini-plan per window.
// Returns both the plans AND the blocked calendar events so the Home page can
// render a full interleaved timeline (events + free windows + venue stops).
//
// Two request modes:
//
//   1. JSON  (Content-Type: application/json)
//        body: {
//          allowedNeighborhoods?: string[],
//          allowedCategories?: string[],
//          hoursAhead?: number,        // default 16
//        }
//
//   2. Multipart (Content-Type: multipart/form-data) — when user uploads a vibe image
//        fields:
//          - "image":  File (jpeg/png/webp, <5MB)
//          - "allowedNeighborhoods": JSON string (optional)
//          - "allowedCategories":    JSON string (optional)
//          - "hoursAhead":           string (optional)
//
// Response (200):
//   {
//     windows: [
//       { freeWindow, plan, candidatesCount },     // one entry per usable free slot
//       ...
//     ],
//     events:  CalendarEvent[],                    // blocked items for the timeline
//     mood:    MoodResult | null,                  // shared across windows (one image per request)
//     debug:   { ragTopK, reason?, totalWindows, plannedWindows }
//   }
//
// Demo story: each layer is honest about what it contributed.
// "0 windows planned" is distinguishable from "RAG empty" is distinguishable from
// "all free windows too short" — no silent failures.

import { NextResponse } from "next/server";
import { getOrCreateDbUser, requireAuth } from "@/lib/auth";
import { extractMoodFromImage, type MoodResult } from "@/lib/ai/mood";
import { retrieveVenues } from "@/lib/ai/rag";
import { generatePlan, type Plan } from "@/lib/ai/plan";
import {
  findFreeWindows,
  getUpcomingEvents,
  type CalendarEvent,
} from "@/lib/calendar/events";
import { DEFAULT_BIAS_LATLNG } from "@/lib/constants/venues";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DEFAULT_HOURS_AHEAD = 16;
const RAG_TOP_K = 8;
const MIN_WINDOW_MINUTES = 45; // matches plan.ts allocateSlots floor
// Hard cap so a packed-but-fragmented day doesn't blow up Groq cost on one tap.
const MAX_WINDOWS_PER_REQUEST = 4;

interface OrchestratorOptions {
  allowedNeighborhoods?: string[];
  allowedCategories?: string[];
  hoursAhead?: number;
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

    // Calendar — events + free windows. Returns [] gracefully on auth/API failure.
    const hoursAhead = options.hoursAhead ?? DEFAULT_HOURS_AHEAD;
    const events = await getUpcomingEvents(user, { hoursAhead });
    const freeWindows = findFreeWindows(events, hoursAhead, MIN_WINDOW_MINUTES);

    if (freeWindows.length === 0) {
      return NextResponse.json({
        windows: [],
        events,
        mood,
        debug: {
          ragTopK: RAG_TOP_K,
          reason: "no_free_window",
          totalWindows: 0,
          plannedWindows: 0,
        },
      });
    }

    // Cap windows to keep latency + cost predictable. Sorted earliest-first by
    // findFreeWindows, so we plan the day in chronological order.
    const windowsToPlan = freeWindows.slice(0, MAX_WINDOWS_PER_REQUEST);

    // Day-wide venue dedupe: a venue picked for the 11am window can't appear in
    // the 4pm window. usedVenueIds grows as we plan each window in order.
    const usedVenueIds = new Set<string>();
    const planned: PlannedWindow[] = [];

    for (const window of windowsToPlan) {
      const biasPoint = pickBiasPoint(events, window.start);

      // L2 — retrieval. We pull RAG_TOP_K + buffer so we still have candidates
      // after filtering out venues already used earlier in the day.
      const rawCandidates = await retrieveVenues({
        dietaryTags: user.dietary_tags ?? [],
        interestTags: user.interest_tags ?? [],
        moodVibes: mood?.vibes,
        windowStart: window.start,
        windowEnd: window.end,
        biasLat: biasPoint.lat,
        biasLng: biasPoint.lng,
        allowedCategories: options.allowedCategories,
        allowedNeighborhoods: options.allowedNeighborhoods,
        topK: RAG_TOP_K + usedVenueIds.size, // grow as the day fills up
      });

      // Filter out venues already booked earlier today.
      const candidates = rawCandidates
        .filter((c) => !usedVenueIds.has(c.venue.id))
        .slice(0, RAG_TOP_K);

      if (candidates.length === 0) {
        planned.push({
          freeWindow: window,
          plan: emptyPlan(),
          candidatesCount: 0,
        });
        continue;
      }

      // L3 — plan generation for this specific window.
      const plan = await generatePlan(candidates, {
        freeWindow: window,
        vibes: mood?.vibes ?? [],
      });

      // Mark each picked venue as used so the next window doesn't repeat it.
      for (const stop of plan.stops) usedVenueIds.add(stop.venueId);

      planned.push({
        freeWindow: window,
        plan,
        candidatesCount: candidates.length,
      });
    }

    return NextResponse.json({
      windows: planned,
      events,
      mood,
      debug: {
        ragTopK: RAG_TOP_K,
        totalWindows: freeWindows.length,
        plannedWindows: planned.length,
        cappedAt: MAX_WINDOWS_PER_REQUEST,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Plan generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---- Helpers ----

/**
 * Read either JSON or multipart and return a normalised options object.
 * Multipart is detected by Content-Type so the caller doesn't need a flag.
 */
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
      imageBuffer,
      imageMimeType,
    };
  }

  // JSON path — no image
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // Empty body is fine — caller wants the cold-start plan with no filters.
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
  };
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
 * Bias point for distance scoring within a window. Logic:
 *   - If there's a calendar event ending shortly before this window, prefer its
 *     location so we don't suggest cross-city venues right after a meeting.
 *   - Else default to TI Bagmane campus (Round 2 demo anchor).
 *
 * For Round 2 we always return the default — events.location is free-text, not
 * geocoded. Round 3 polish: geocode event locations.
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
