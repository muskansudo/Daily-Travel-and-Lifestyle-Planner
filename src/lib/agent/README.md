# Agent layer (Stage 3)

Round 3 — deterministic agent loop above Stage 2's planner.

## What this directory is

The agent is the answer to the Round 2 cross-question "what makes this more
than a planner?" It observes the world (weather, AQI, calendar, user
location), classifies disruptions against the current plan, repairs only
what broke, and surfaces a transparent diff with a streaming reasoning
trace.

Stage 2 is untouched. The agent reads `PlanStop` / `Plan` shapes as-is.

## Files (Day 1)

| File | Purpose |
|---|---|
| `types.ts` | All shared agent type definitions. Source of truth for shapes. |
| `thresholds.ts` | Constants + pure detector functions. Panel-quotable numbers live here only. |
| `categoryProperties.ts` | Indoor/outdoor lookup. Used by the classifier (Day 2). |
| `eventStore.ts` | In-memory event log. Swap for Supabase-backed in L4. |
| `../app/api/agent/simulate/route.ts` | Demo trigger AND live monitor sink. Both go through this one endpoint. |
| `../app/api/agent/monitor/status/route.ts` | Status read for the green-dot indicator and debug panel. |
| `../components/agent/useAgentMonitor.ts` | Client-side poll loop. Mount on home screen. |

## Files coming Day 2

- `classifier.ts` — pure function: `(event, plan) → AffectedStop[]`
- `repair.ts` — calls Stage 2 `replace-stop` per affected stop, cascades
  travel + outfit, builds a `RepairResult`
- `../app/api/agent/repair/route.ts` — wraps classifier + repair, returns
  `RepairResult`
- `../app/api/agent/stream/[eventId]/route.ts` — SSE stream of reasoning
  trace lines

## Files coming Day 3

- `../components/agent/ReasoningTracePanel.tsx`
- `../components/agent/PlanDiff.tsx`
- `../components/agent/AgentStatusIndicator.tsx`

## Decisions on record

### Why client-side polling, not server cron

Next.js doesn't ship a long-running worker. The two production paths are
Vercel Cron (5-min min granularity) or Supabase Edge functions on a
schedule. Both are L4.

For the demo, client-side polling is real, visible in dev-tools, and uses
the same detector functions a cron job would. The panel answer: "Production
runs server-side on a 5-minute cron. Demo runs client-side at 30s for
visibility during the 15-minute window. Same detectors, same event payload."

### Why one endpoint for manual + live

`/api/agent/simulate` accepts both `manual_trigger` and `live_poll` events.
The downstream pipeline (classifier, repair, diff) sees one event shape and
doesn't care where it came from. Building two paths would be a lie waiting
to be caught — "the demo is staged" if a judge inspects the code. One path
makes "demo trigger is a real event with source=manual_trigger" a true
statement.

### Why in-memory event store

For the demo, process memory is plenty: events live for the page session,
status reads them, fresh deploy clears them. The module exports
(`appendEvent`, `getRecentEvents`, `getEventById`, `setLastSnapshot`,
`getLastSnapshot`) are the same signatures a Supabase-backed implementation
would expose. Persistence is a one-file swap.

### Why detectors are pure functions

Threshold logic has zero I/O, zero `Date.now()`, zero side effects. This
means:

1. Unit tests don't need network mocks.
2. The same detectors can run inside the manual-trigger flow without
   modification — `detectAqiSpike(previousSnapshot, simulatedAqi)` works
   identically whether the second argument came from `/api/weather` or
   from a button-click payload.
3. The panel answer to "how do you know a 50-point delta is right?" is
   `AQI_DELTA_THRESHOLD` in `thresholds.ts` — one number, one place,
   sourced from the Indian NAQI bucket widths.

### Why category proxies indoor/outdoor instead of a new column

Adding an `indoor` column to the venues table would require a migration
that touches Stage 2 retrieval. We'd then need to backfill 79 venues by
hand. Category → indoor is a 9-line lookup that gets us 95% of the way
there and zero migration work. If a future category (e.g. "rooftop_bar")
straddles the line, we add the column then.

## Panel defense — anchors

- "Is this an agent?" → §1 of the spec, plus point to `useAgentMonitor.ts`
  showing the observe-decide-act loop running.
- "Deterministic or autonomous?" → "Deterministic agent loop. Reliability
  choice for Stage 3. LLM tool-selection on L4 roadmap."
- "Show me the threshold logic" → `thresholds.ts`. One file.
- "How do you avoid noise?" → `shouldDedupe`, 60s per-type window.
- "Production polling cadence?" → 5 min (`POLL_INTERVAL_MS_PROD`),
  configurable, demo runs at 30s for visibility.

## Day-1 acceptance test

After running locally:

1. Open the home screen.
2. Open dev-tools network tab. Confirm a `/api/weather` request fires
   every 30s.
3. Hit `curl http://localhost:3000/api/agent/monitor/status`. Confirm
   `lastPoll` updates after each interval and `lastSnapshot` reflects
   the latest weather/AQI reading.
4. Hit `/api/agent/simulate` with a manual event:
   ```bash
   curl -X POST http://localhost:3000/api/agent/simulate \
     -H 'Content-Type: application/json' \
     -b cookies.txt \
     -d '{
       "type": "aqi_spike",
       "payload": {
         "type": "aqi_spike",
         "previous": 92,
         "current": 168,
         "delta": 76,
         "location": { "lat": 12.9716, "lng": 77.5946 }
       }
     }'
   ```
   Confirm the response includes `eventId` and the next `/status` call
   shows the event in `recentEvents`.

If all four pass, Day 1 is done.
