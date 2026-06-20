// API: POST /api/agent/monitor/snapshot
//
// The client monitor hook (useAgentMonitor) POSTs its latest reading here
// after each poll, so the server-side status endpoint can report lastPoll
// and lastSnapshot. Without this, /monitor/status always shows lastPoll:
// null (the server never sees the client's polls).
//
// This is purely observational state — it does NOT trigger the classifier or
// repair. Disruptions still flow through /api/agent/simulate. Snapshot is
// just "here's what the world looked like at my last poll" so the green-dot
// indicator can show a real timestamp and the debug panel can show the last
// weather/AQI reading.
//
// Request body: MonitorSnapshot
// Response (200): { ok: true }

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { setLastSnapshot } from "@/lib/agent/eventStore";
import type { MonitorSnapshot } from "@/lib/agent/types";

const snapshotSchema = z.object({
  takenAt: z.string(),
  weather: z
    .object({ condition: z.string(), temperature: z.number() })
    .nullable(),
  aqi: z.number().nullable(),
  userLocation: z
    .object({ lat: z.number(), lng: z.number() })
    .nullable(),
});

export async function POST(request: Request) {
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

  const parsed = snapshotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  setLastSnapshot(parsed.data as MonitorSnapshot);
  return NextResponse.json({ ok: true });
}
