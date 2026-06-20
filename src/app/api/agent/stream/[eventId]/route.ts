// API: GET /api/agent/stream/[eventId]?... (Server-Sent Events)
//
// The demo-winning endpoint. Runs the SAME repair pipeline as
// /api/agent/repair, but streams the reasoning trace line-by-line as Server-
// Sent Events so the UI panel can render the agent "thinking" in real time.
//
// Why SSE and not WebSockets: SSE is one-directional (server -> client),
// which is exactly what a reasoning trace is. It works over plain HTTP, needs
// no extra server, and Next.js route handlers can return a ReadableStream
// directly. WebSockets would be over-engineering for a one-way text stream.
//
// IMPORTANT — the plan can't come in a GET querystring (too big). So the demo
// flow is:
//   1. Client POSTs the plan to /api/agent/repair/prepare (or stashes it),
//      OR
//   2. Client opens the stream with the eventId, and the plan is POSTed first
//      to a prepare step.
//
// To keep Day 2 simple and avoid a second stash endpoint, this stream uses
// POST with a body (EventSource only does GET, so the client uses fetch +
// ReadableStream reader instead of EventSource — documented in the Day 3 UI).
// The streaming contract is the same: newline-delimited `data: {json}\n\n`
// frames.
//
// Frame types emitted:
//   data: { "kind": "line", "line": ReasoningLine }      // one per trace step
//   data: { "kind": "done", "result": RepairResult,      // terminal frame
//           "repairedPlan": PlanGenerateResponse }
//   data: { "kind": "error", "message": string }         // on failure
//
// The per-line stagger (so judges can read each step) is enforced here with a
// small delay between frames. The delay is presentation-only; the underlying
// repair already happened. We deliberately DON'T fake the repair work — we run
// it for real, collect the trace, then stream the collected lines with a
// readable cadence. (Running repair truly incrementally would interleave Groq
// latency unpredictably and make the demo timing unreliable.)

import { getOrCreateDbUser, requireAuth } from "@/lib/auth";
import { getEventById } from "@/lib/agent/eventStore";
import { classify, type FlatStop } from "@/lib/agent/classifier";
import { runRepair, type ReplacementCandidate } from "@/lib/agent/repair";
import type { LatLng, ReasoningLine } from "@/lib/agent/types";
import type {
  PlanGenerateResponse,
  PlannedWindowResponse,
} from "@/lib/home/generatePlan";
import type { PlanStop, TimeSlot } from "@/lib/ai/plan";
import { retrieveVenues } from "@/lib/ai/rag";
import { generatePlanForSlot } from "@/lib/ai/plan";
import { bucketForHour, DEFAULT_BIAS_LATLNG } from "@/lib/constants/venues";
import { istTodayAtHHMM } from "@/lib/calendar/manualEvents";

const RAG_TOP_K = 8;
// Stagger between trace lines (ms). Tuned so a ~10-line trace reads over ~3s.
const LINE_STAGGER_MS = 280;

interface StreamBody {
  plan: PlanGenerateResponse;
  userLocation?: LatLng | null;
  vibes?: string[];
}

export async function POST(
  request: Request,
  { params }: { params: { eventId: string } }
) {
  const clerkId = await requireAuth();
  if (!clerkId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const event = getEventById(params.eventId);
  if (!event) {
    return new Response("Unknown eventId", { status: 404 });
  }

  let body: StreamBody;
  try {
    body = (await request.json()) as StreamBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (!body.plan) {
    return new Response("plan is required", { status: 400 });
  }

  const user = await getOrCreateDbUser(clerkId);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

      try {
        const flatStops = await buildFlatStops(body.plan, user);
        const affected = classify(event, flatStops);
        const userLocation =
          body.userLocation ?? {
            lat: DEFAULT_BIAS_LATLNG.lat,
            lng: DEFAULT_BIAS_LATLNG.lng,
          };

        const { result, repairedStops } = await runRepair({
          eventId: params.eventId,
          stops: flatStops,
          affected,
          userLocation,
          findReplacement: async (_aff, flat) =>
            findIndoorReplacement(flat, body, user),
        });

        // Stream the collected trace with a readable cadence.
        for (const line of result.reasoningTrace as ReasoningLine[]) {
          send({ kind: "line", line });
          await sleep(LINE_STAGGER_MS);
        }

        const repairedPlan = applyRepairs(body.plan, repairedStops);
        send({ kind: "done", result, repairedPlan });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Repair failed";
        send({ kind: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

// ─── Shared helpers (mirror /api/agent/repair) ───────────────────────────────
//
// Duplicated intentionally rather than shared via import: the two routes have
// the same logic today, but the stream route may diverge (true incremental
// streaming) on L4. Keeping them separate avoids a premature abstraction. If
// they stay identical past Day 4, extract to lib/agent/repairPipeline.ts.

async function buildFlatStops(
  plan: PlanGenerateResponse,
  user: Awaited<ReturnType<typeof getOrCreateDbUser>>
): Promise<FlatStop[]> {
  const raw: PlanStop[] = [];
  for (const window of plan.windows) {
    for (const stop of window.plan.stops) raw.push(stop);
  }
  const locationIndex = await buildLocationIndex(user);
  return raw.map((stop, i) => ({
    stopIndex: i,
    stop,
    location: locationIndex.get(stop.venueId) ?? null,
    window: {
      start: istTodayAtHHMM(stop.startTime).toISOString(),
      end: istTodayAtHHMM(stop.endTime).toISOString(),
    },
  }));
}

async function buildLocationIndex(
  user: Awaited<ReturnType<typeof getOrCreateDbUser>>
): Promise<Map<string, LatLng>> {
  const index = new Map<string, LatLng>();
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
    // Fail safe — empty index, location-sensitive rules won't fire.
  }
  return index;
}

async function findIndoorReplacement(
  flat: FlatStop,
  body: StreamBody,
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

function applyRepairs(
  plan: PlanGenerateResponse,
  repairedStops: Map<number, PlanStop>
): PlanGenerateResponse {
  if (repairedStops.size === 0) return plan;
  let runningIndex = 0;
  const windows: PlannedWindowResponse[] = plan.windows.map((window) => {
    const stops = window.plan.stops.map((stop) => {
      const idx = runningIndex++;
      return repairedStops.get(idx) ?? stop;
    });
    return { ...window, plan: { ...window.plan, stops } };
  });
  return { ...plan, windows };
}
