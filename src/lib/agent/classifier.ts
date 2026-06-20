// Agent layer — disruption classifier.
//
// Pure function. Given a disruption event and the current plan, returns the
// list of stops the disruption actually affects, each tagged with a reason,
// severity, and the action the repair engine should attempt.
//
// "Pure" is load-bearing here:
//   - No network. No DB. No Date.now() inside the decision logic (the caller
//     passes `now` when a rule needs the clock).
//   - Same inputs always produce the same output. This is what lets us unit-
//     test every rule and what makes the panel answer to "how does it decide
//     what to keep?" a single readable file instead of a black box.
//
// The four rules mirror STAGE_3_AGENT_SPEC §4. If you change a rule, change
// the spec table in the same commit so the panel-defense doc never drifts
// from the code.
//
// IMPORTANT — the classifier reads stops but NEVER mutates them. It returns
// indices + reasons. The repair engine is the only thing that produces a new
// plan. This separation is what keeps the surgical invariant honest: the
// classifier can't accidentally touch an unaffected stop because it doesn't
// hold a writable plan at all.

import type {
  AffectedStop,
  DisruptionEvent,
  LatLng,
  TimeWindow,
} from "@/lib/agent/types";
import { haversineKm } from "@/lib/agent/thresholds";
import { isOutdoor } from "@/lib/agent/categoryProperties";
import type { PlanStop } from "@/lib/ai/plan";

// How close a stop must be to the disruption's location to count as "in the
// affected zone". 1 km — tight enough that a Koramangala AQI spike doesn't
// flag a Whitefield stop, loose enough to cover a neighborhood.
const EVENT_RADIUS_KM = 1;

// For AQI, only flag stops in the near future — a spike now doesn't matter
// for a stop 6 hours out (AQI will have changed by then; we'll re-evaluate
// on the next poll). 4 hours.
const AQI_LOOKAHEAD_MS = 4 * 60 * 60 * 1000;

/**
 * A flattened stop carries everything the classifier needs without re-reading
 * the nested windows[].plan.stops[] structure on every rule. The caller
 * (repair engine / repair route) builds these from the PlanGenerateResponse.
 *
 * `location` is looked up from the venue at flatten time — PlanStop itself
 * doesn't carry lat/lng, but the repair route has the venue rows in hand from
 * retrieval and can attach them. When location is unknown (null), location-
 * sensitive rules treat the stop as NOT in the affected zone (fail safe — we
 * don't repair a stop we can't locate, we leave it alone).
 */
export interface FlatStop {
  stopIndex: number;
  stop: PlanStop;
  /** Resolved venue coordinates. Null when unknown. */
  location: LatLng | null;
  /** Parsed from PlanStop.startTime/endTime against today (IST). */
  window: TimeWindow;
}

/**
 * Classify a disruption against the current plan.
 *
 * Three temporal states matter for each stop:
 *
 *   PAST       — stop.window.end ≤ now. Already happened. Filtered out
 *                before any rule runs; cannot be affected by a present-tense
 *                disruption.
 *
 *   IN_PROGRESS — stop.window.start ≤ now < stop.window.end. The user is
 *                AT the venue right now. Outdoor + weather/AQI disruption
 *                still flags the stop, but with suggestedAction =
 *                "in_progress_alert". The repair engine does NOT auto-swap
 *                a stop someone is sitting at — it surfaces a contextual
 *                suggestion and the user decides. Auto-modifying an in-
 *                flight stop would be agentic-overreach.
 *
 *   FUTURE     — stop.window.start > now. The normal repair path: salvage
 *                or replace as the rule dictates.
 *
 * @param event   The disruption (from monitor poll or manual trigger).
 * @param stops   Flattened plan stops with resolved location + window.
 * @param now     Current time in ms. Injected so the function stays pure and
 *                testable. Defaults to Date.now() for convenience at callsites
 *                that don't care about determinism.
 */
export function classify(
  event: DisruptionEvent,
  stops: FlatStop[],
  now: number = Date.now()
): AffectedStop[] {
  // Drop past stops first. Cheap, explicit, panel-defensible.
  const liveStops = stops.filter(
    (s) => new Date(s.window.end).getTime() > now
  );

  switch (event.payload.type) {
    case "rain":
      return classifyRain(event.payload.location, event.payload.window, liveStops, now);
    case "aqi_spike":
      return classifyAqi(event.payload.location, liveStops, now);
    case "calendar_cancel":
      return classifyCalendarCancel(event.payload.originalSlot, liveStops);
    case "location_change":
      return classifyLocationChange(liveStops);
    case "heat_alert":
      return classifyHeat(event.payload.location, event.payload.window, liveStops, now);
  }
}

// ─── Rule 1: rain ──────────────────────────────────────────────────────────
//
// An outdoor stop is affected if it's within the event radius AND its time
// window overlaps the rain window. Indoor stops are never affected by rain.
//
// Temporal split: if the user is AT the stop right now (in-progress), we
// emit an in_progress_alert instead of a replace. Auto-swapping a venue
// someone is currently at would be agentic-overreach — the agent suggests,
// the user decides.

function classifyRain(
  location: LatLng,
  rainWindow: TimeWindow,
  stops: FlatStop[],
  now: number
): AffectedStop[] {
  const affected: AffectedStop[] = [];
  for (const fs of stops) {
    if (!isOutdoor(fs.stop.category)) continue;
    if (!withinRadius(fs.location, location)) continue;
    if (!windowsOverlap(fs.window, rainWindow)) continue;

    if (isInProgress(fs, now)) {
      affected.push({
        stopIndex: fs.stopIndex,
        venueId: fs.stop.venueId,
        reason: `You're at ${fs.stop.venueName} and it's started raining. Want help finding shelter nearby?`,
        severity: "critical",
        suggestedAction: "in_progress_alert",
      });
      continue;
    }

    affected.push({
      stopIndex: fs.stopIndex,
      venueId: fs.stop.venueId,
      reason: `${fs.stop.venueName} is outdoor and rain is forecast during its ${fmt(fs.window)} window`,
      severity: "critical",
      suggestedAction: "replace",
    });
  }
  return affected;
}

// ─── Rule 2: AQI spike ─────────────────────────────────────────────────────
//
// An outdoor stop is affected if it's within the event radius AND starts
// within the lookahead horizon. Spending time outdoors in a high-AQI window
// is the thing we're protecting against, so only outdoor stops flag.
//
// Same temporal-split logic as rain: in-progress stops get an alert, not
// a venue swap.

function classifyAqi(
  location: LatLng,
  stops: FlatStop[],
  now: number
): AffectedStop[] {
  const affected: AffectedStop[] = [];
  const horizon = now + AQI_LOOKAHEAD_MS;

  for (const fs of stops) {
    if (!isOutdoor(fs.stop.category)) continue;
    if (!withinRadius(fs.location, location)) continue;

    const startMs = new Date(fs.window.start).getTime();
    // Future stops outside the horizon: skip (too far out).
    if (startMs > horizon) continue;

    if (isInProgress(fs, now)) {
      affected.push({
        stopIndex: fs.stopIndex,
        venueId: fs.stop.venueId,
        reason: `You're at ${fs.stop.venueName} and AQI has spiked here. Want help finding indoor shelter nearby?`,
        severity: "critical",
        suggestedAction: "in_progress_alert",
      });
      continue;
    }

    affected.push({
      stopIndex: fs.stopIndex,
      venueId: fs.stop.venueId,
      reason: `${fs.stop.venueName} is outdoor and AQI has spiked in the area during its ${fmt(fs.window)} window`,
      severity: "critical",
      suggestedAction: "replace",
    });
  }
  return affected;
}

// ─── Rule 3: calendar cancel ───────────────────────────────────────────────
//
// When a meeting is canceled, the stop(s) whose window overlapped that meeting
// don't need replacing — they need the freed time. We mark the FIRST stop
// after the freed slot as a salvage candidate (its window can now expand) and,
// if a stop literally overlapped the (now-gone) meeting, we surface that too.
//
// Design choice: a cancel is an OPPORTUNITY, not a breakage. The repair engine
// treats salvage-from-cancel as "the day got freer, see if a stop can grow or
// a new stop fits". We don't auto-insert a new venue here — that's the repair
// engine's job, and it's gated so the demo stays predictable.

function classifyCalendarCancel(
  canceledSlot: TimeWindow,
  stops: FlatStop[]
): AffectedStop[] {
  const affected: AffectedStop[] = [];
  for (const fs of stops) {
    if (!windowsOverlap(fs.window, canceledSlot)) continue;
    affected.push({
      stopIndex: fs.stopIndex,
      venueId: fs.stop.venueId,
      reason: `${fs.stop.venueName} sat next to a meeting that was just canceled; its ${fmt(fs.window)} window can now expand`,
      severity: "minor",
      suggestedAction: "salvage",
    });
  }
  return affected;
}

// ─── Rule 4: location change ───────────────────────────────────────────────
//
// When the user physically moves more than 2 km, the plan's travel chain is
// stale. Stage 2 already chains stop-to-stop, but the FIRST edge (user →
// stop 1) is anchored to wherever the plan was generated from. When that
// anchor moves, the entire chain's timing shifts.
//
// Rather than only flag the first stop, we flag every remaining future stop
// for travel recompute. The repair engine cascades through them in order:
//   - stop 1 re-anchors to the user's new location
//   - stop 2 re-anchors to stop 1
//   - stop 3 re-anchors to stop 2
//   - ...
//
// This is the "moving anchor" model. The agent doesn't pretend you started
// the day where you were at 7am — it re-evaluates routing from where you
// actually are now. Calendar events with locations (e.g. "gym at 6pm")
// become natural checkpoints in this chain.
//
// What this rule does NOT do: re-rank venues. If you moved closer to a
// different venue than the one currently planned, we don't auto-swap or
// suggest a swap. That's deliberate — proper re-ranking requires another L2
// retrieval pass per checkpoint, and is on the L4 roadmap. Today the user
// sees honest, updated travel times and can manually swap via the existing
// skip-this-stop UI if the new travel time is too long.

function classifyLocationChange(stops: FlatStop[]): AffectedStop[] {
  if (stops.length === 0) return [];
  return stops.map((fs, i) => ({
    stopIndex: fs.stopIndex,
    venueId: fs.stop.venueId,
    reason:
      i === 0
        ? `You moved more than 2 km; travel time to ${fs.stop.venueName} re-anchors to your new location`
        : `Travel chain re-anchored upstream; recomputing time to ${fs.stop.venueName} from the previous stop`,
    severity: "minor",
    suggestedAction: "recompute_travel",
  }));
}


// ─── Rule 5: heat alert ────────────────────────────────────────────────────
//
// Temperature above 38°C at an outdoor stop = flag it. Same intersection
// logic as rain: outdoor, within radius, window overlaps the heat window.
// In-progress stops get an alert (you're there now, can't auto-move you);
// future stops get a replace (swap for shaded outdoor or indoor alternative).
//
// Extensibility note for the panel: "Adding a new disruption type requires
// one new rule here, one new payload in types.ts, and one handler in
// repair.ts. The rest of the pipeline — monitor, event store, repair route,
// SSE stream, diff renderer — handles it automatically."

function classifyHeat(
  location: LatLng,
  heatWindow: TimeWindow,
  stops: FlatStop[],
  now: number
): AffectedStop[] {
  const affected: AffectedStop[] = [];
  for (const fs of stops) {
    if (!isOutdoor(fs.stop.category)) continue;
    if (!withinRadius(fs.location, location)) continue;
    if (!windowsOverlap(fs.window, heatWindow)) continue;

    if (isInProgress(fs, now)) {
      affected.push({
        stopIndex: fs.stopIndex,
        venueId: fs.stop.venueId,
        reason: `You are at ${fs.stop.venueName} and it is above 38°C outside. Consider moving indoors soon.`,
        severity: "critical",
        suggestedAction: "in_progress_alert",
      });
      continue;
    }

    affected.push({
      stopIndex: fs.stopIndex,
      venueId: fs.stop.venueId,
      reason: `${fs.stop.venueName} is outdoor and temperatures are forecast above 38°C during its ${fmt(fs.window)} window`,
      severity: "critical",
      suggestedAction: "replace",
    });
  }
  return affected;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function withinRadius(stopLoc: LatLng | null, eventLoc: LatLng): boolean {
  // Fail safe: if we can't locate the stop, don't flag it. Better to leave a
  // stop alone than to repair the wrong one.
  if (!stopLoc) return false;
  return haversineKm(stopLoc, eventLoc) <= EVENT_RADIUS_KM;
}

function windowsOverlap(a: TimeWindow, b: TimeWindow): boolean {
  const aStart = new Date(a.start).getTime();
  const aEnd = new Date(a.end).getTime();
  const bStart = new Date(b.start).getTime();
  const bEnd = new Date(b.end).getTime();
  return aStart < bEnd && bStart < aEnd;
}

/**
 * A stop is "in progress" if right now sits inside its window. Past stops
 * are filtered upstream in classify(), so this only distinguishes in-progress
 * from future.
 */
function isInProgress(fs: FlatStop, now: number): boolean {
  const startMs = new Date(fs.window.start).getTime();
  const endMs = new Date(fs.window.end).getTime();
  return startMs <= now && now < endMs;
}

/** Compact HH:MM-HH:MM (IST) for reason strings. */
function fmt(w: TimeWindow): string {
  const f = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  return `${f(w.start)}-${f(w.end)}`;
}
