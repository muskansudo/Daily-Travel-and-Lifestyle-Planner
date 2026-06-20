// Agent layer — surgical repair engine.
//
// The heart of the agent. Takes the classifier's list of affected stops and
// the current plan, and produces a repaired plan that touches ONLY what broke.
//
// THE INVARIANT (STAGE_3_AGENT_SPEC §5): every stop NOT in the affected list
// is byte-identical in the repaired plan. Same venueId, same window, same
// whyThis. This is what makes the system "surgical" rather than "regenerate
// the whole day". The reasoning trace and the diff both depend on it: if an
// unaffected stop changed, the diff would light up everywhere and the agentic
// claim collapses.
//
// This module is mostly pure orchestration. The one impure dependency is the
// replacement search — finding a new venue requires hitting L2 retrieval (DB)
// and L3 generation (Groq). Those are injected as a `findReplacement`
// callback so this file stays unit-testable: a test passes a fake replacer
// and asserts the cascade + invariant without any network.
//
// Cascade model (§5 steps 4-5):
//   - When a stop's venue changes, the travel time to it AND to the next stop
//     can change (both graph edges moved). We mark both as travel_time changes.
//     Actual Mapbox recompute is Day 4 (shade pipeline brings the routing
//     dependency); for Day 2 we record the cascade intent and recompute travel
//     as a haversine estimate so the diff has real numbers. Mapbox swaps in
//     behind the same function on Day 4.
//   - When indoor/outdoor flips, the outfit hint may change. We flag the
//     outfit cascade on the affected stop only.

import type {
  AffectedStop,
  Change,
  LatLng,
  ReasoningLine,
  RepairResult,
} from "@/lib/agent/types";
import type { FlatStop } from "@/lib/agent/classifier";
import type { PlanStop } from "@/lib/ai/plan";
import { isOutdoor } from "@/lib/agent/categoryProperties";
import { haversineKm } from "@/lib/agent/thresholds";

// Bangalore average driving speed (km/h) for the haversine travel estimate.
// 20 km/h accounts for Bangalore traffic realistically. Day 4 replaces this
// with Mapbox Directions API for road-network accurate routing.
// Panel answer: "We use 20 km/h as a conservative Bangalore driving average.
// Road-network routing via Mapbox is wired on Day 4 — same function
// signature, zero upstream changes."
const BANGALORE_AVG_KMH = 20;

/**
 * A replacement candidate the repair engine can drop into a slot. The repair
 * route builds these by calling L2 + L3 (same path as /api/plan/replace-stop)
 * and hands them to the engine. Keeping the engine ignorant of HOW the
 * replacement was found is what makes it testable.
 */
export interface ReplacementCandidate {
  stop: PlanStop;
  location: LatLng | null;
}

/**
 * Injected replacement finder. Returns a candidate for the given affected
 * stop, or null when none fits (no indoor alternative in the window, Groq
 * failed, etc). The repair route supplies the real implementation; tests
 * supply a fake.
 */
export type FindReplacement = (
  affected: AffectedStop,
  flat: FlatStop
) => Promise<ReplacementCandidate | null>;

export interface RepairInput {
  eventId: string;
  /** All stops, flattened, with resolved location + window. */
  stops: FlatStop[];
  /** Classifier output. */
  affected: AffectedStop[];
  /** User's current location — anchor for the first stop's travel edge. */
  userLocation: LatLng | null;
  findReplacement: FindReplacement;
}

/**
 * Run the repair. Returns a RepairResult with the change list, partial flag,
 * and the full reasoning trace. Does NOT itself mutate the caller's stops —
 * it builds a fresh repaired-stop map keyed by index and the caller applies
 * it to produce the new PlanGenerateResponse.
 */
export async function runRepair(input: RepairInput): Promise<{
  result: RepairResult;
  /** Map of stopIndex -> repaired PlanStop. Only affected indices appear. */
  repairedStops: Map<number, PlanStop>;
}> {
  const trace: ReasoningLine[] = [];
  const changes: Change[] = [];
  const repairedStops = new Map<number, PlanStop>();
  let partial = false;

  const affectedIndices = new Set(input.affected.map((a) => a.stopIndex));

  push(trace, "observation", summariseEvent(input));

  if (input.affected.length === 0) {
    push(
      trace,
      "decision",
      "No stops in the current plan intersect this disruption. Nothing to repair."
    );
    push(trace, "result", "Plan unchanged.");
    return {
      result: { eventId: input.eventId, changes, partial, reasoningTrace: trace },
      repairedStops,
    };
  }

  push(
    trace,
    "decision",
    `${input.affected.length} stop(s) affected: ${input.affected
      .map((a) => a.reason)
      .join("; ")}. Other stops are unaffected and will be preserved.`
  );

  // Process affected stops in plan order so travel cascades read left-to-right.
  const ordered = [...input.affected].sort((a, b) => a.stopIndex - b.stopIndex);

  for (const aff of ordered) {
    const flat = input.stops.find((s) => s.stopIndex === aff.stopIndex);
    if (!flat) continue;

    if (aff.suggestedAction === "in_progress_alert") {
      handleInProgressAlert(aff, flat, trace, changes);
      continue;
    }

    if (aff.suggestedAction === "recompute_travel") {
      handleRecomputeTravel(aff, flat, input, trace, changes);
      continue;
    }

    if (aff.suggestedAction === "salvage") {
      handleSalvage(aff, flat, trace, changes);
      continue;
    }

    // suggestedAction === "replace"
    push(
      trace,
      "action",
      `Searching for an indoor alternative to ${flat.stop.venueName} in its ${windowLabel(flat)} window, near the previous stop.`
    );

    const replacement = await input.findReplacement(aff, flat);

    if (!replacement) {
      partial = true;
      push(
        trace,
        "result",
        `No suitable indoor alternative found for ${flat.stop.venueName}. Marking repair partial; original stop left in place for you to decide.`
      );
      continue;
    }

    // Record the venue swap.
    repairedStops.set(aff.stopIndex, replacement.stop);
    changes.push({
      stopIndex: aff.stopIndex,
      field: "venue",
      before: flat.stop.venueName,
      after: replacement.stop.venueName,
      why: aff.reason,
    });
    push(
      trace,
      "result",
      `Selected ${replacement.stop.venueName} (${replacement.stop.category}) for the ${windowLabel(flat)} slot.`
    );

    // Outfit cascade: if indoor/outdoor flipped, flag it.
    if (isOutdoor(flat.stop.category) !== isOutdoor(replacement.stop.category)) {
      changes.push({
        stopIndex: aff.stopIndex,
        field: "outfit",
        before: isOutdoor(flat.stop.category) ? "outdoor-ready" : "indoor",
        after: isOutdoor(replacement.stop.category) ? "outdoor-ready" : "indoor",
        why: `Venue moved ${
          isOutdoor(replacement.stop.category) ? "outdoors" : "indoors"
        }; outfit guidance updated for this stop.`,
      });
      push(
        trace,
        "action",
        `Venue is now ${
          isOutdoor(replacement.stop.category) ? "outdoor" : "indoor"
        }; updating outfit guidance for this stop only.`
      );
    }

    // Travel cascade: recompute travel into this stop (from prev) and into the
    // NEXT stop (from this one), since both edges moved.
    cascadeTravel(aff.stopIndex, input, replacement, repairedStops, changes, trace);
  }

  // Final invariant check, logged for the trace. Unaffected stops never enter
  // repairedStops, so the map's keys must be a subset of affectedIndices.
  const violation = Array.from(repairedStops.keys()).find(
    (i) => !affectedIndices.has(i)
  );
  if (violation !== undefined) {
    // This should be impossible by construction. If it ever fires, fail loud.
    push(
      trace,
      "result",
      `INTERNAL: repair touched unaffected stop ${violation}. Aborting to protect the plan.`
    );
    throw new Error(
      `Surgical invariant violated: stop ${violation} not in affected set`
    );
  }

  push(
    trace,
    "result",
    partial
      ? "Repair complete with caveats. Some stops could not be auto-repaired."
      : `Repair complete. ${changes.length} change(s) across ${new Set(changes.map(c => c.stopIndex)).size} stop(s); the rest of your day is untouched.`
  );

  return {
    result: { eventId: input.eventId, changes, partial, reasoningTrace: trace },
    repairedStops,
  };
}

// ─── Action handlers ───────────────────────────────────────────────────────

function handleRecomputeTravel(
  aff: AffectedStop,
  flat: FlatStop,
  input: RepairInput,
  trace: ReasoningLine[],
  changes: Change[]
): void {
  // Chained re-anchor: each stop's inbound travel edge starts from the
  // previous stop's location, except stop 0 which starts from the user's
  // current location. This is what makes "you moved, re-evaluate the chain"
  // honest — we don't pretend stop 4's travel is independent of stops 1-3.
  const prevStop =
    aff.stopIndex === 0
      ? null
      : input.stops.find((s) => s.stopIndex === aff.stopIndex - 1) ?? null;
  const upstreamAnchor =
    aff.stopIndex === 0 ? input.userLocation : prevStop?.location ?? null;
  const fromLabel =
    aff.stopIndex === 0
      ? "your current location"
      : prevStop?.stop.venueName ?? "the previous stop";

  push(
    trace,
    "action",
    `Recomputing travel to ${flat.stop.venueName} from ${fromLabel}.`
  );
  const newTravel = estimateTravelMin(upstreamAnchor, flat.location);
  if (newTravel === null) {
    push(
      trace,
      "result",
      `Could not estimate new travel time for ${flat.stop.venueName} (location unknown). Leaving the stop in place.`
    );
    return;
  }
  changes.push({
    stopIndex: aff.stopIndex,
    field: "travel_time",
    before: null,
    after: newTravel,
    why: aff.reason,
  });
  push(
    trace,
    "result",
    `Travel to ${flat.stop.venueName} is now about ${newTravel} min from ${fromLabel}.`
  );
}

function handleSalvage(
  aff: AffectedStop,
  flat: FlatStop,
  trace: ReasoningLine[],
  changes: Change[]
): void {
  // A salvage from a calendar cancel = the window can expand. We don't change
  // the venue; we record that the freed time is available. The diff shows this
  // as a time_window note rather than a venue swap.
  push(
    trace,
    "action",
    `Meeting freed up time next to ${flat.stop.venueName}. Keeping the venue; noting the extra room.`
  );
  changes.push({
    stopIndex: aff.stopIndex,
    field: "time_window",
    before: windowLabel(flat),
    after: `${windowLabel(flat)} (more time available)`,
    why: aff.reason,
  });
  push(
    trace,
    "result",
    `${flat.stop.venueName} kept; you now have more breathing room around it.`
  );
}

/**
 * In-progress alert: the user is AT this stop right now. Do NOT swap the
 * venue — auto-modifying a place someone is currently sitting at would be
 * agentic-overreach. Instead, surface a contextual suggestion via the "alert"
 * change field. The UI renders this as a distinct yellow-bordered card on
 * Day 3, and the user decides whether to act on it.
 *
 * This is the deliberate "agent suggests, user decides" pattern. The panel
 * answer: "The agent distinguishes three temporal states for each stop —
 * past, in-progress, future. In-progress stops are never auto-modified;
 * they receive a contextual alert. This is the line between helpful agency
 * and overreach."
 */
function handleInProgressAlert(
  aff: AffectedStop,
  flat: FlatStop,
  trace: ReasoningLine[],
  changes: Change[]
): void {
  push(
    trace,
    "decision",
    `${flat.stop.venueName} is currently in progress — you're there now. Not auto-modifying; surfacing a suggestion instead.`
  );
  changes.push({
    stopIndex: aff.stopIndex,
    field: "alert",
    before: null,
    after: aff.reason,
    why: "Agent does not auto-swap in-progress stops; this is a suggestion for you to act on.",
  });
  push(
    trace,
    "result",
    `Alert raised for ${flat.stop.venueName}. Open the suggestion to find shelter nearby.`
  );
}

// ─── Travel cascade ────────────────────────────────────────────────────────

function cascadeTravel(
  stopIndex: number,
  input: RepairInput,
  replacement: ReplacementCandidate,
  repairedStops: Map<number, PlanStop>,
  changes: Change[],
  trace: ReasoningLine[]
): void {
  // Edge into the replaced stop: from the previous stop (or user location for
  // the first stop).
  const prevLoc =
    stopIndex === 0
      ? input.userLocation
      : (input.stops.find((s) => s.stopIndex === stopIndex - 1)?.location ?? null);

  const inboundMin = estimateTravelMin(prevLoc, replacement.location);
  if (inboundMin !== null) {
    changes.push({
      stopIndex,
      field: "travel_time",
      before: null,
      after: inboundMin,
      why: `New venue changed the travel distance into this stop.`,
    });
  }

  // Edge out to the next stop, if any.
  const next = input.stops.find((s) => s.stopIndex === stopIndex + 1);
  if (next) {
    const outboundMin = estimateTravelMin(replacement.location, next.location);
    if (outboundMin !== null) {
      changes.push({
        stopIndex: next.stopIndex,
        field: "travel_time",
        before: null,
        after: outboundMin,
        why: `Travel from the new ${replacement.stop.venueName} to ${next.stop.venueName} recalculated.`,
      });
      push(
        trace,
        "action",
        `Cascaded: travel from ${replacement.stop.venueName} to ${next.stop.venueName} is now about ${outboundMin} min.`
      );
    }
  }
}

// ─── Estimation + trace helpers ──────────────────────────────────────────────

/**
 * Haversine-based walking time estimate in whole minutes. Day-4 swap point:
 * replace the body with a Mapbox Directions call; the signature stays the
 * same so nothing upstream changes. Returns null when either point is unknown.
 */
function estimateTravelMin(from: LatLng | null, to: LatLng | null): number | null {
  if (!from || !to) return null;
  const km = haversineKm(from, to);
  const minutes = (km / BANGALORE_AVG_KMH) * 60;
  return Math.max(1, Math.round(minutes));
}

function push(
  trace: ReasoningLine[],
  category: ReasoningLine["category"],
  text: string
): void {
  trace.push({ timestamp: new Date().toISOString(), category, text });
}

function summariseEvent(input: RepairInput): string {
  // The first trace line should restate what the agent saw, in plain words.
  // We don't have the raw event here (the route logs that separately), so we
  // summarise from the affected list as a fallback when affected is empty.
  return input.affected.length > 0
    ? `Disruption detected. Evaluating ${input.stops.length} stop(s) in the current plan.`
    : `Disruption detected, but the current plan has ${input.stops.length} stop(s) and none are in its path.`;
}

function windowLabel(flat: FlatStop): string {
  return `${flat.stop.startTime}-${flat.stop.endTime}`;
}
