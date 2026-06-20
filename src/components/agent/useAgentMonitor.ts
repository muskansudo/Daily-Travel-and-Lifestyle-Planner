"use client";

// Agent monitor — client-side polling hook.
//
// Why client-side: Next.js doesn't have a long-running server worker out
// of the box. The two production options are Vercel Cron (5-min minimum
// granularity) or Supabase Edge functions on a schedule. Both are L4
// concerns. For the demo, the client hook is:
//   - real code (no setTimeout-then-fake-result trick)
//   - visible in dev-tools network tab so judges can see the polls happening
//   - honest in the panel ("production runs server-side cron, demo runs
//     client-side polling — same detector functions, same event payload")
//
// Lifecycle:
//   1. Mount on the home screen. setInterval starts polling /api/weather.
//   2. Every poll: fetch current weather + AQI, build a new MonitorSnapshot.
//   3. Run pure detectors against previous snapshot. If any fires:
//        - Build a DisruptionEvent
//        - POST to /api/agent/simulate with source = "live_poll"
//        - The server stores it; downstream pipeline (Day 2) picks it up.
//   4. Update snapshot for next poll.
//   5. On unmount, clear the interval.
//
// Geolocation note: getCurrentPosition is opt-in. We try once on mount; if
// the user denies, location-change detection is silently disabled. The
// other three disruption types still work.

import { useEffect, useRef, useState } from "react";
import {
  detectAqiSpike,
  detectHeat,
  detectLocationChange,
  detectRain,
  HEAT_THRESHOLD_C,
  POLL_INTERVAL_MS_DEMO,
  POLL_INTERVAL_MS_PROD,
  shouldDedupe,
} from "@/lib/agent/thresholds";
import type {
  DisruptionEvent,
  DisruptionPayload,
  LatLng,
  MonitorSnapshot,
} from "@/lib/agent/types";
import { BANGALORE } from "@/lib/weather/constants";

interface UseAgentMonitorOptions {
  /** Disable the monitor entirely (e.g. on routes where it shouldn't run). */
  enabled?: boolean;
  /** Override the poll interval. Defaults to demo cadence in development. */
  intervalMs?: number;
}

interface AgentMonitorState {
  running: boolean;
  lastPoll: string | null;
  lastSnapshot: MonitorSnapshot | null;
  recentEvents: DisruptionEvent[];
}

const isDev = process.env.NODE_ENV !== "production";

export function useAgentMonitor(
  options: UseAgentMonitorOptions = {}
): AgentMonitorState {
  const enabled = options.enabled ?? true;
  const intervalMs =
    options.intervalMs ?? (isDev ? POLL_INTERVAL_MS_DEMO : POLL_INTERVAL_MS_PROD);

  const [state, setState] = useState<AgentMonitorState>({
    running: false,
    lastPoll: null,
    lastSnapshot: null,
    recentEvents: [],
  });

  // Snapshot ref so the polling closure always sees the latest previous
  // reading without re-triggering effects.
  const snapshotRef = useRef<MonitorSnapshot | null>(null);
  const recentEventsRef = useRef<DisruptionEvent[]>([]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    // One-time geolocation request. Failure is silent — location-change
    // detection just stays off.
    let userLocation: LatLng | null = null;
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          userLocation = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
        },
        () => {
          // Permission denied or unavailable. Silent fallback.
          if (isDev) console.log("[agent] geolocation unavailable");
        },
        { maximumAge: 60_000, timeout: 5_000 }
      );
    }

    async function pollOnce() {
      if (cancelled) return;

      try {
        const res = await fetch("/api/weather");
        if (!res.ok) {
          if (isDev) console.warn("[agent] weather fetch failed", res.status);
          return;
        }
        const data = (await res.json()) as {
          weather?: {
            condition: string;
            temperature: number;
            aqi: number | null;
          };
        };

        const w = data.weather;
        if (!w) return;

        const previous = snapshotRef.current;
        const snapshot: MonitorSnapshot = {
          takenAt: new Date().toISOString(),
          weather: { condition: w.condition, temperature: w.temperature },
          aqi: w.aqi,
          userLocation,
        };

        if (isDev) {
          console.log(
            `[agent] poll @ ${snapshot.takenAt} — weather=${w.condition}/${w.temperature}°C aqi=${w.aqi}`
          );
        }

        // Run detectors against previous + current.
        const events: DisruptionEvent[] = [];
        const now = Date.now();
        const fixedLocation: LatLng = { lat: BANGALORE.lat, lng: BANGALORE.lon };

        const rain = detectRain(snapshot.weather);
        if (rain && !shouldDedupe("rain", recentEventsRef.current, now)) {
          events.push(
            buildEvent("rain", {
              type: "rain",
              condition: rain.condition,
              location: userLocation ?? fixedLocation,
              window: {
                start: snapshot.takenAt,
                end: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
              },
            })
          );
        }

        const aqi = detectAqiSpike(previous, snapshot.aqi);
        if (aqi && !shouldDedupe("aqi_spike", recentEventsRef.current, now)) {
          events.push(
            buildEvent("aqi_spike", {
              type: "aqi_spike",
              previous: aqi.previous,
              current: aqi.current,
              delta: aqi.delta,
              location: userLocation ?? fixedLocation,
            })
          );
        }

        const heat = detectHeat(snapshot.weather);
        if (heat && !shouldDedupe("heat_alert", recentEventsRef.current, now)) {
          events.push(
            buildEvent("heat_alert", {
              type: "heat_alert",
              temperatureC: heat.temperatureC,
              location: userLocation ?? fixedLocation,
              window: {
                start: snapshot.takenAt,
                end: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
              },
            })
          );
        }

        const loc = detectLocationChange(previous, userLocation);
        if (
          loc &&
          !shouldDedupe("location_change", recentEventsRef.current, now)
        ) {
          events.push(
            buildEvent("location_change", {
              type: "location_change",
              previous: loc.previous,
              current: loc.current,
              distanceKm: loc.distanceKm,
            })
          );
        }

        // Fire each detected event to the server. Sequential so they land
        // in deterministic order, but we don't await them serially in a way
        // that would block the next poll.
        for (const event of events) {
          try {
            await fetch("/api/agent/simulate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: event.type,
                source: "live_poll",
                payload: event.payload,
              }),
            });
          } catch (e) {
            if (isDev) console.warn("[agent] event POST failed", e);
          }
        }

        // Update refs FIRST so the next poll sees the new snapshot/events.
        snapshotRef.current = snapshot;
        recentEventsRef.current = [
          ...events,
          ...recentEventsRef.current,
        ].slice(0, 20);

        setState({
          running: true,
          lastPoll: snapshot.takenAt,
          lastSnapshot: snapshot,
          recentEvents: recentEventsRef.current,
        });
      } catch (e) {
        if (isDev) console.warn("[agent] poll error", e);
      }
    }

    // Mark running, then kick off the first poll immediately + schedule.
    setState((s) => ({ ...s, running: true }));
    pollOnce();
    const timer = setInterval(pollOnce, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, intervalMs]);

  return state;
}

// ─── Local helper ──────────────────────────────────────────────────────────

function buildEvent(
  type: DisruptionEvent["type"],
  payload: DisruptionPayload
): DisruptionEvent {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    timestamp: new Date().toISOString(),
    source: "live_poll",
    payload,
  };
}
