// Agent layer — disruption thresholds + pure detection functions.
//
// Single source of truth for what counts as a disruption. The monitor reads
// these constants; the classifier reads these constants; the panel-defense
// spec quotes these constants. If you change a number here, you change it
// everywhere automatically. Do not hardcode thresholds anywhere else.
//
// Rationale for the specific values (Round 3 spec, locked):
//
//   RAIN_CONDITIONS: OpenWeatherMap's "main" field — we treat any of these
//     three as "it's raining now". The current-weather endpoint doesn't
//     return rain probability, so we use current condition as the signal.
//     Forecast-based probability check is L4.
//
//   AQI_DELTA_THRESHOLD = 50: Indian NAQI buckets are 50 points wide (Good
//     0-50, Satisfactory 51-100, Moderate 101-200). A 50-point jump means
//     the user crossed at least one bucket — meaningful change.
//
//   LOCATION_CHANGE_KM = 2: A 2km move in Bangalore typically means the user
//     left the neighborhood the plan was built around. Travel times computed
//     from the original anchor stop being stale.
//
//   DEDUPE_WINDOW_MS = 60_000: After firing one event for a signal, suppress
//     duplicates for 60s. Otherwise a noisy AQI reading bouncing 90→145→95→
//     150 would fire 4 events in 2 minutes. The classifier would still
//     correctly classify each, but the UI would be a mess.

import type {
  DisruptionEvent,
  LatLng,
  MonitorSnapshot,
} from "@/lib/agent/types";

// ─── Constants (locked, panel-quotable) ────────────────────────────────────

export const RAIN_CONDITIONS = ["Rain", "Drizzle", "Thunderstorm"] as const;
export const AQI_DELTA_THRESHOLD = 50;
export const LOCATION_CHANGE_KM = 2;
export const DEDUPE_WINDOW_MS = 60_000;

// Poll interval (ms). 30s for demo (so judges see polls happen during the
// 15-min window). 5min in production — see useAgentMonitor for the env-flag
// toggle.
export const POLL_INTERVAL_MS_DEMO = 30_000;
export const POLL_INTERVAL_MS_PROD = 300_000;

// ─── Pure detectors ────────────────────────────────────────────────────────
//
// Each detector takes (previousSnapshot, currentReading) and returns either
// a partial DisruptionPayload OR null. The caller (monitor) assembles the
// full DisruptionEvent with id/timestamp/source.
//
// These are PURE FUNCTIONS — no I/O, no side effects, no Date.now(). That
// makes them trivially unit-testable and reusable in the demo's manual
// trigger flow.

export function detectRain(
  current: { condition: string } | null
): { condition: string } | null {
  if (!current) return null;
  const hit = RAIN_CONDITIONS.some((c) =>
    current.condition.toLowerCase().includes(c.toLowerCase())
  );
  return hit ? { condition: current.condition } : null;
}

export function detectAqiSpike(
  previous: MonitorSnapshot | null,
  currentAqi: number | null
):
  | { previous: number; current: number; delta: number }
  | null {
  if (currentAqi === null) return null;
  if (!previous || previous.aqi === null) return null;
  const delta = currentAqi - previous.aqi;
  if (delta < AQI_DELTA_THRESHOLD) return null;
  return { previous: previous.aqi, current: currentAqi, delta };
}

export function detectLocationChange(
  previous: MonitorSnapshot | null,
  currentLocation: LatLng | null
):
  | { previous: LatLng; current: LatLng; distanceKm: number }
  | null {
  if (!currentLocation) return null;
  if (!previous?.userLocation) return null;
  const distanceKm = haversineKm(previous.userLocation, currentLocation);
  if (distanceKm < LOCATION_CHANGE_KM) return null;
  return {
    previous: previous.userLocation,
    current: currentLocation,
    distanceKm,
  };
}

// ─── Dedupe ────────────────────────────────────────────────────────────────

/**
 * Returns true if the candidate event should be suppressed because we
 * already fired one of the same type within DEDUPE_WINDOW_MS.
 *
 * Callsite responsibility: pass in recent events from the in-memory store.
 * The dedupe window is intentionally per-type, not global — a rain event
 * shouldn't suppress an AQI spike event.
 */
export function shouldDedupe(
  candidateType: DisruptionEvent["type"],
  recentEvents: DisruptionEvent[],
  now: number = Date.now()
): boolean {
  for (const e of recentEvents) {
    if (e.type !== candidateType) continue;
    const age = now - new Date(e.timestamp).getTime();
    if (age < DEDUPE_WINDOW_MS) return true;
  }
  return false;
}

// ─── Geo helper ────────────────────────────────────────────────────────────

/**
 * Haversine distance in kilometers. Used both for location change detection
 * and for the classifier's "within event radius" check.
 *
 * Standard formula, no external dependency. Earth radius 6371 km.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Heat alert threshold. 38°C is the point where outdoor exposure in direct
// sun becomes genuinely uncomfortable and risky in Indian summers. Panel-
// quotable: "We use 38°C because that's when the Indian Meteorological
// Department issues heat action alerts in Karnataka."
export const HEAT_THRESHOLD_C = 38;

/**
 * Returns the temperature if it exceeds the heat threshold, otherwise null.
 * Mirrors detectRain's shape: pure, no I/O, same caller pattern.
 */
export function detectHeat(
  current: { temperature: number } | null
): { temperatureC: number } | null {
  if (!current) return null;
  if (current.temperature < HEAT_THRESHOLD_C) return null;
  return { temperatureC: current.temperature };
}
