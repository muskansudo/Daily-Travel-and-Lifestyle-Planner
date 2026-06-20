// API: POST /api/agent/repair
//
// The synchronous repair endpoint. Given a disruption event id and the
// current plan (sent in the body — the plan lives in the client's
// localStorage, not the DB), this:
//
//   1. Loads the event from the in-memory store.
//   2. Flattens the plan's windows -> stops, resolving each venue's location
//      and time window.
//   3. Runs the classifier (pure) to find affected stops.
//   4. Runs the repair engine, injecting a real findReplacement that hits
//      L2 retrieval + L3 generation (same path as /api/plan/replace-stop).
//   5. Applies the repaired stops back into a copy of the plan, preserving
//      every unaffected stop byte-for-byte.
//   6. Returns { repairedPlan, result } where result carries changes +
//      reasoning trace.
//
// The streaming variant (/api/agent/stream/[eventId]) reuses this same
// pipeline but emits the trace line-by-line over SSE. This endpoint returns
// the whole thing at once — used by the diff renderer to get the final
// repaired plan, and as a non-SSE fallback.
//
// Request body:
//   {
//     eventId: string,
//     plan: PlanGenerateResponse,          // current plan from localStorage
//     userLocation?: { lat, lng } | null,  // for travel cascade anchor
//     vibes?: string[],
//     manualEntries?: ManualScheduleEntry[],
//   }
//
// Response (200):
//   { repairedPlan: PlanGenerateResponse, result: RepairResult }

import { NextResponse } from "next/server";
import { getOrCreateDbUser, requireAuth } from "@/lib/auth";
import { getEventById } from "@/lib/agent/eventStore";
import { classify, type FlatStop } from "@/lib/agent/classifier";
import {
  runRepair,
  type ReplacementCandidate,
} from "@/lib/agent/repair";
import type { LatLng } from "@/lib/agent/types";
import type {
  PlanGenerateResponse,
  PlannedWindowResponse,
} from "@/lib/home/generatePlan";
import type { PlanStop, TimeSlot } from "@/lib/ai/plan";
import { retrieveVenues } from "@/lib/ai/rag";
import { generatePlanForSlot } from "@/lib/ai/plan";
import {
  bucketForHour,
  DEFAULT_BIAS_LATLNG,
} from "@/lib/constants/venues";
import { istTodayAtHHMM } from "@/lib/calendar/manualEvents";

const RAG_TOP_K = 8;

interface RepairRequestBody {
  eventId: string;
  plan: PlanGenerateResponse;
  userLocation?: LatLng | null;
  vibes?: string[];
}

export async function POST(request: Request) {
  const clerkId = await requireAuth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RepairRequestBody;
  try {
    body = (await request.json()) as RepairRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.eventId || !body.plan) {
    return NextResponse.json(
      { error: "eventId and plan are required" },
      { status: 400 }
    );
  }

  const event = getEventById(body.eventId);
  if (!event) {
    return NextResponse.json(
      { error: "Unknown eventId — event not found in store" },
      { status: 404 }
    );
  }

  try {
    const user = await getOrCreateDbUser(clerkId);

    // ── Flatten windows -> stops, resolving location + window per stop. ──
    // Venue coordinates aren't stored on PlanStop, so we look them up from
    // the venue rows via a single retrieval pass keyed by venueId. Cheapest
    // correct approach: pull the candidate set we'd use anyway and index by
    // id. For stops whose venue isn't in that set, location stays null and
    // the classifier fails safe (won't flag a stop it can't locate).
    const flatStops = await buildFlatStops(body.plan, user);

    // ── Classify (pure). ──
    const affected = classify(event, flatStops);

    // ── Repair, injecting the real replacement finder. ──
    const userLocation =
      body.userLocation ?? { lat: DEFAULT_BIAS_LATLNG.lat, lng: DEFAULT_BIAS_LATLNG.lng };

    const { result, repairedStops } = await runRepair({
      eventId: body.eventId,
      stops: flatStops,
      affected,
      userLocation,
      findReplacement: async (aff, flat) => {
        return findIndoorReplacement(flat, body, user);
      },
    });

    // ── Apply repaired stops back into a fresh plan copy. ──
    const repairedPlan = applyRepairs(body.plan, repairedStops);

    return NextResponse.json({ repairedPlan, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Repair failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── Flatten + locate ────────────────────────────────────────────────────────

async function buildFlatStops(
  plan: PlanGenerateResponse,
  user: Awaited<ReturnType<typeof getOrCreateDbUser>>
): Promise<FlatStop[]> {
  // Collect all stops with their window start dates.
  const raw: Array<{ stop: PlanStop; startDate: Date }> = [];
  for (const window of plan.windows) {
    for (const stop of window.plan.stops) {
      raw.push({ stop, startDate: istTodayAtHHMM(stop.startTime) });
    }
  }

  // Build a venueId -> location index. We do ONE broad retrieval (no time
  // filter, high topK) and index whatever comes back. Stops whose venue isn't
  // returned get location null (fail-safe).
  const locationIndex = await buildLocationIndex(user);

  return raw.map((entry, i) => {
    const loc = locationIndex.get(entry.stop.venueId) ?? null;
    return {
      stopIndex: i,
      stop: entry.stop,
      location: loc,
      window: {
        start: istTodayAtHHMM(entry.stop.startTime).toISOString(),
        end: istTodayAtHHMM(entry.stop.endTime).toISOString(),
      },
    };
  });
}

async function buildLocationIndex(
  user: Awaited<ReturnType<typeof getOrCreateDbUser>>
): Promise<Map<string, LatLng>> {
  const index = new Map<string, LatLng>();
  // Broad pull: no time filter, large topK, no category exclusion. This
  // returns the venues in the user's relevant set; we only need their coords.
  try {
    const results = await retrieveVenues({
      dietaryTags: user.dietary_tags ?? [],
      interestTags: user.interest_tags ?? [],
      biasLat: DEFAULT_BIAS_LATLNG.lat,
      biasLng: DEFAULT_BIAS_LATLNG.lng,
      topK: 200,
    });
    for (const r of results) {
      index.set(r.venue.id, { lat: r.venue.lat, lng: r.venue.lng });
    }
  } catch {
    // If retrieval fails, every stop gets null location; classifier fails
    // safe (no location-sensitive flags). The agent still handles calendar
    // cancels (window-based, no location needed).
  }
  return index;
}

// ─── Replacement finder (L2 + L3) ────────────────────────────────────────────

async function findIndoorReplacement(
  flat: FlatStop,
  body: RepairRequestBody,
  user: Awaited<ReturnType<typeof getOrCreateDbUser>>
): Promise<ReplacementCandidate | null> {
  const startDate = istTodayAtHHMM(flat.stop.startTime);
  const endDate = istTodayAtHHMM(flat.stop.endTime);

  const slot: TimeSlot = {
    startTime: flat.stop.startTime,
    endTime: flat.stop.endTime,
    startDate,
    endDate,
  };

  // Exclude the venue being replaced + every other venue currently in the
  // plan (day-wide dedupe). We don't have the full exclude list here; the
  // caller could pass it, but for the demo the single exclude is enough and
  // L3 sanitises against the candidate set anyway.
  const candidates = await retrieveVenues({
    dietaryTags: user.dietary_tags ?? [],
    interestTags: user.interest_tags ?? [],
    moodVibes: body.vibes && body.vibes.length > 0 ? body.vibes : undefined,
    windowStart: startDate,
    windowEnd: endDate,
    biasLat: DEFAULT_BIAS_LATLNG.lat,
    biasLng: DEFAULT_BIAS_LATLNG.lng,
    timeOfDay: bucketForHour(startDate),
    topK: RAG_TOP_K,
  });

  // Filter to indoor venues only (the disruption that triggered a "replace"
  // was weather or AQI, both of which require moving indoors). Drop the venue
  // being replaced.
  const indoor = candidates.filter(
    (c) =>
      c.venue.id !== flat.stop.venueId &&
      !["park", "walk"].includes(c.venue.category)
  );

  if (indoor.length === 0) return null;

  const stop = await generatePlanForSlot(indoor, slot, body.vibes ?? []);
  if (!stop) return null;

  const chosen = indoor.find((c) => c.venue.id === stop.venueId);
  return {
    stop,
    location: chosen ? { lat: chosen.venue.lat, lng: chosen.venue.lng } : null,
  };
}

// ─── Apply repairs (preserve unaffected stops byte-for-byte) ─────────────────

function applyRepairs(
  plan: PlanGenerateResponse,
  repairedStops: Map<number, PlanStop>
): PlanGenerateResponse {
  if (repairedStops.size === 0) return plan;

  // Walk the same flatten order used in buildFlatStops, swapping in repaired
  // stops by index. Unaffected stops are copied by reference — they are
  // literally the same object, which makes the byte-identical invariant
  // trivially true.
  let runningIndex = 0;
  const windows: PlannedWindowResponse[] = plan.windows.map((window) => {
    const stops = window.plan.stops.map((stop) => {
      const idx = runningIndex++;
      return repairedStops.get(idx) ?? stop;
    });
    return {
      ...window,
      plan: { ...window.plan, stops },
    };
  });

  return { ...plan, windows };
}
