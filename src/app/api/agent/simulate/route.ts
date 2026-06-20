// API: POST /api/agent/simulate
//
// The demo entry point. The "What if AQI spikes / it rains / your meeting
// gets canceled" button on the home screen POSTs here with a synthetic
// disruption payload. The endpoint validates, assigns id + timestamp,
// stamps source = "manual_trigger", appends to the event store, and
// returns the event id.
//
// CRITICAL PANEL POINT: this endpoint is the same downstream pipeline that
// the live monitor uses. When the monitor detects a real threshold
// crossing, it POSTs to this same endpoint (with source = "live_poll"
// set by the client). So "demo trigger" and "real disruption" are byte-
// identical events from this endpoint forward. We never built a fake path.
//
// In Day 2 this endpoint will also call the classifier + repair engine
// synchronously and return the RepairResult inline (or stream it via SSE).
// Day 1 scope: just append-and-return so Regina can verify the wiring with
// curl / the UI button before classifier exists.
//
// Request body:
//   {
//     type: "rain" | "aqi_spike" | "calendar_cancel" | "location_change",
//     source?: "manual_trigger" | "live_poll",   // defaults to manual
//     payload: { ... type-specific ... }
//   }
//
// Response (200):
//   { eventId: string, event: DisruptionEvent }
//
// Response (400) on validation failure:
//   { error: string }

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { appendEvent } from "@/lib/agent/eventStore";
import type {
  DisruptionEvent,
  DisruptionPayload,
} from "@/lib/agent/types";

// ─── Zod schemas (per-type payload discrimination) ─────────────────────────
//
// Zod is already a project dependency (see package.json — used by
// onboarding validations). Using it here keeps the validation style
// consistent with the rest of the codebase.

const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const timeWindowSchema = z.object({
  start: z.string(),
  end: z.string(),
});

const rainPayloadSchema = z.object({
  type: z.literal("rain"),
  condition: z.string().min(1),
  location: latLngSchema,
  window: timeWindowSchema,
});

const aqiPayloadSchema = z.object({
  type: z.literal("aqi_spike"),
  previous: z.number().min(0),
  current: z.number().min(0),
  delta: z.number(),
  location: latLngSchema,
});

const calendarPayloadSchema = z.object({
  type: z.literal("calendar_cancel"),
  eventId: z.string().min(1),
  eventTitle: z.string(),
  originalSlot: timeWindowSchema,
});

const locationPayloadSchema = z.object({
  type: z.literal("location_change"),
  previous: latLngSchema,
  current: latLngSchema,
  distanceKm: z.number().min(0),
});

const heatPayloadSchema = z.object({
  type: z.literal("heat_alert"),
  temperatureC: z.number().min(0),
  location: latLngSchema,
  window: timeWindowSchema,
});

const payloadSchema = z.discriminatedUnion("type", [
  rainPayloadSchema,
  aqiPayloadSchema,
  calendarPayloadSchema,
  locationPayloadSchema,
  heatPayloadSchema,
]);

const bodySchema = z.object({
  type: z.enum(["rain", "aqi_spike", "calendar_cancel", "location_change", "heat_alert"]),
  source: z.enum(["manual_trigger", "live_poll"]).optional(),
  payload: payloadSchema,
});

// ─── Handler ───────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // Auth: the agent is per-user (its decisions reference the user's plan).
  // Same gate as /api/plan/generate.
  const clerkId = await requireAuth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Cross-check: body.type must match payload.type. The discriminated union
  // gives us payload.type already; this just guards against a client sending
  // mismatched fields.
  if (parsed.data.type !== parsed.data.payload.type) {
    return NextResponse.json(
      { error: "body.type and payload.type must match" },
      { status: 400 }
    );
  }

  const event: DisruptionEvent = {
    id: crypto.randomUUID(),
    type: parsed.data.type,
    timestamp: new Date().toISOString(),
    source: parsed.data.source ?? "manual_trigger",
    payload: parsed.data.payload as DisruptionPayload,
  };

  appendEvent(event);

  // Day-1 console log so Regina can watch events land in the terminal during
  // dev. Day 2 will replace this with classifier + repair invocation.
  console.log(
    `[agent] event ${event.id} type=${event.type} source=${event.source}`
  );

  return NextResponse.json({ eventId: event.id, event });
}
