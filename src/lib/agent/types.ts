// Agent layer — type definitions.
//
// Stage 3 sits on top of Stage 2's planner. This file defines the canonical
// shapes that flow through the agent loop: events the monitor emits, the
// per-stop classification the classifier produces, and the result the repair
// engine returns to the UI.
//
// Design rule: agent types do NOT modify Stage 2's PlanStop / Plan shapes.
// The agent reads those as-is and looks up venue properties (indoor vs
// outdoor, lat/lng) via category + venue_id when needed. This keeps the
// surgical-repair invariant honest at the type level — unaffected stops are
// byte-identical before and after a repair because the agent never touches
// their shape.

// ─── Disruption events ─────────────────────────────────────────────────────

export type DisruptionType =
  | "rain"
  | "aqi_spike"
  | "calendar_cancel"
  | "location_change"
  | "heat_alert";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface TimeWindow {
  /** ISO 8601, IST */
  start: string;
  /** ISO 8601, IST */
  end: string;
}

/**
 * A disruption event is the unit of work the agent reacts to. It carries
 * enough context (location, window, deltas) that the classifier can decide
 * which stops are affected without re-reading the world.
 *
 * source: "live_poll" means the monitor caught a real reading crossing a
 * threshold. "manual_trigger" means the demo UI fired it via /api/agent/
 * simulate. Both go through the same downstream pipeline — the field exists
 * for logging and panel honesty ("the trigger is manual, the engine is real").
 */
export interface DisruptionEvent {
  id: string;
  type: DisruptionType;
  timestamp: string; // ISO 8601
  source: "live_poll" | "manual_trigger";
  payload: DisruptionPayload;
}

export type DisruptionPayload =
  | { type: "rain"; condition: string; location: LatLng; window: TimeWindow }
  | {
      type: "aqi_spike";
      previous: number;
      current: number;
      delta: number;
      location: LatLng;
    }
  | {
      type: "calendar_cancel";
      eventId: string;
      eventTitle: string;
      originalSlot: TimeWindow;
    }
  | {
      type: "location_change";
      previous: LatLng;
      current: LatLng;
      distanceKm: number;
    }
  | { type: "heat_alert"; temperatureC: number; location: LatLng; window: TimeWindow };

// ─── Classifier output ─────────────────────────────────────────────────────

/**
 * What the repair engine should attempt for an affected stop.
 *
 *   salvage             — keep the venue, adjust the window or note freed time
 *   replace             — swap the venue (e.g. outdoor → indoor for AQI/rain)
 *   recompute_travel    — only the travel edge is stale (e.g. user moved)
 *   in_progress_alert   — the user is AT this stop right now. The agent does
 *                         NOT auto-modify; it surfaces a contextual suggestion
 *                         and the user decides. See ChangeField "alert".
 */
export type SuggestedAction =
  | "salvage"
  | "replace"
  | "recompute_travel"
  | "in_progress_alert";

export interface AffectedStop {
  /** Index of the stop in plan.stops — stable across the repair pipeline. */
  stopIndex: number;
  /** PlanStop.venueId — for cross-referencing back to the original plan. */
  venueId: string;
  /** Human-readable reason. Surfaced verbatim in the reasoning trace. */
  reason: string;
  severity: "critical" | "minor";
  suggestedAction: SuggestedAction;
}

// ─── Repair output ─────────────────────────────────────────────────────────

/**
 * What changed about a stop during repair. "alert" is special — used for
 * in-progress stops where the agent surfaces a suggestion instead of
 * mutating the plan. The UI renders alert-fielded changes as yellow-bordered
 * cards, distinct from green (unchanged), red (removed), blue (added).
 */
export type ChangeField =
  | "venue"
  | "time_window"
  | "outfit"
  | "travel_time"
  | "alert";

export interface Change {
  stopIndex: number;
  field: ChangeField;
  before: unknown;
  after: unknown;
  /** Used as the per-card "why" caption in the diff renderer. */
  why: string;
}

/**
 * Reasoning trace line. Streamed to the UI as the repair runs.
 *
 * "category" maps to a visual treatment in the trace panel:
 *   - observation  → grey (the world told us X)
 *   - decision     → indigo (we concluded Y)
 *   - action       → terracotta (we did Z)
 *   - result       → green (it worked / partial / failed)
 */
export interface ReasoningLine {
  timestamp: string; // ISO 8601
  category: "observation" | "decision" | "action" | "result";
  text: string;
}

export interface RepairResult {
  eventId: string;
  changes: Change[];
  /** True when at least one affected stop couldn't be fully repaired. */
  partial: boolean;
  reasoningTrace: ReasoningLine[];
}

// ─── Monitor snapshot ──────────────────────────────────────────────────────

/**
 * The monitor remembers its last reading per signal so the next poll can
 * detect a delta. Stored client-side in the useAgentMonitor hook.
 * Server-side polling is a Vercel Cron / Supabase Edge function concern that
 * we treat as L4 — for the demo, client-side polling is real, visible in
 * dev-tools network tab, and good enough.
 */
export interface MonitorSnapshot {
  /** ISO 8601 — when this snapshot was taken. */
  takenAt: string;
  weather: { condition: string; temperature: number } | null;
  aqi: number | null;
  /** Last known user location. Updated when the user moves >100m. */
  userLocation: LatLng | null;
}

export interface MonitorStatus {
  running: boolean;
  lastPoll: string | null;
  /** Last N events kept in memory for the status panel. */
  recentEvents: DisruptionEvent[];
  /** Most recent snapshot — surfaced for debugging. */
  lastSnapshot: MonitorSnapshot | null;
}
