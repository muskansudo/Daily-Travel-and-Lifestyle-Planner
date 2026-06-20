// API: GET /api/agent/monitor/status
//
// Read-only endpoint surfacing the agent monitor's current state. Used by:
//   1. The green-dot "agent is watching" indicator on the home screen.
//   2. The debug panel during demo rehearsal so Regina can see the last
//      poll timestamp and last few events.
//   3. Day 2+ — the reasoning trace panel reads recentEvents to render its
//      history.
//
// Returns the running state (always true while the server process is alive
// — the actual polling runs client-side via useAgentMonitor), the last
// snapshot the monitor captured, and the last N events from the in-memory
// store.

import { NextResponse } from "next/server";
import {
  getLastSnapshot,
  getRecentEvents,
} from "@/lib/agent/eventStore";
import type { MonitorStatus } from "@/lib/agent/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const recentEvents = getRecentEvents();
  const lastSnapshot = getLastSnapshot();

  const status: MonitorStatus = {
    // Server is up = monitor framework is up. The actual poll cadence is
    // driven by the client hook — if the hook is mounted on the home screen,
    // polls are happening every 30s. Status reflects "framework available",
    // not "poll loop is running right now".
    running: true,
    lastPoll: lastSnapshot?.takenAt ?? null,
    recentEvents,
    lastSnapshot,
  };

  return NextResponse.json(status);
}
