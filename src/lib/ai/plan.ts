// L3 Plan generation — Saanjh's grounded LLM layer
//
// Architecture under the v2 design (design doc sections 4, 9):
//   - The orchestrator (route.ts) calls allocateSlots() ONCE per window to
//     carve human-shaped slots (60-90 min, 5-min boundaries, busy-aware).
//   - Then for EACH slot, the orchestrator calls retrieveVenues() with the
//     slot's time-of-day bucket as a hard filter, and passes the candidate
//     set to generatePlanForSlot() which picks ONE venue for ONE slot.
//   - Per-slot generation is more LLM calls (one per slot) but each call is
//     tiny and tightly scoped — output is dramatically more curated.
//
// What's deterministic (code-owned):
//   - Slot allocation. Window length sets stop count (1-4), each slot is
//     60-90 min on a 5-min boundary. Multi-stop windows divide into equal
//     phases so stops are spread ~3h apart on a wide-open day, not clustered.
//   - Hard guard: a slot is dropped if it overlaps any busy interval.
//   - Venue picks must come from the input RagResult set. Sanitiser rejects
//     any venue id not in the candidate list. No hallucinated venues survive.
//   - Times formatted in IST regardless of server timezone (Vercel runs UTC).
//
// What's LLM-owned:
//   - Picking WHICH venue from the top-K fits the slot.
//   - Writing the whyThis line, grounded in venue.whyThisShort sensory tag.
//
// Fallback: returns null when Groq fails. Orchestrator decides what to do
// (typically: try once more or skip the slot).

import type { RagResult } from "@/lib/types/venue";
import {
  overlapsAnyBusy,
  type BusyInterval,
} from "@/lib/calendar/events";
import { bucketForHour } from "@/lib/constants/venues";

// NOTE: Verify model name at console.groq.com/models before relying on it.
// Groq has rotated names — if this 404s, swap and the fallback kicks in
// silently (stop becomes null). Check Groq logs if demo behaves oddly.
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

// Temperature tuned for the demo balance: low enough for rehearsal stability,
// high enough that whyThis prose doesn't feel canned.
const GROQ_TEMPERATURE = 0.3;

// IST formatting — Vercel servers run in UTC, so we explicitly format here.
const IST_TIMEZONE = "Asia/Kolkata";

// Slot duration policy. Design doc section 9.
const MIN_SLOT_MIN = 60;
const PREFERRED_SLOT_MIN = 75;
const MAX_SLOT_MIN = 90;
const SLOT_BUFFER_MIN = 15;
// Window thresholds for stop-count scaling.
const TWO_STOP_MIN_WINDOW = 2 * PREFERRED_SLOT_MIN + SLOT_BUFFER_MIN;
const THREE_STOP_MIN_WINDOW = 330; // 5.5h
const FOUR_STOP_MIN_WINDOW = 540; // 9h

export interface PlanStop {
  venueId: string;
  venueName: string;
  category: string;
  neighborhood: string;
  startTime: string; // HH:MM, 24h, IST
  endTime: string;
  whyThis: string;
}

export interface Plan {
  stops: PlanStop[];
  summary: string;
  aiGenerated: boolean;
}

export interface TimeSlot {
  startTime: string;
  endTime: string;
  // Date forms kept so the orchestrator can re-validate against busy intervals
  // without re-parsing HH:MM strings. Not serialised out to the client.
  startDate: Date;
  endDate: Date;
}

/**
 * Carve a free window into 1-4 venue slots.
 *
 *   - 60-min minimum, 90-min maximum, 75-min preferred slot duration.
 *   - 5-min boundary alignment on slot start times.
 *   - Stop count scales with window length:
 *       60-164 min   → 1 stop
 *       165-329 min  → 2 stops
 *       330-539 min  → 3 stops
 *       540+ min     → 4 stops
 *   - Multi-stop windows divide into equal phases. Anchor a 75-min slot at
 *     the start of each phase — gives 3+ hour gaps between stops naturally.
 *   - Hard guard: any slot that overlaps a busy interval is dropped.
 *   - Per-window stop count never exceeds the day-wide `maxStops` budget the
 *     orchestrator passes in.
 */
export function allocateSlots(
  window: { start: Date; end: Date },
  busy: BusyInterval[],
  maxStops: number
): TimeSlot[] {
  if (maxStops <= 0) return [];

  const cursor = roundUpToFiveMin(window.start);
  const usableMin = (window.end.getTime() - cursor.getTime()) / 60_000;
  if (usableMin < MIN_SLOT_MIN) return [];

  const naturalStops =
    usableMin >= FOUR_STOP_MIN_WINDOW
      ? 4
      : usableMin >= THREE_STOP_MIN_WINDOW
        ? 3
        : usableMin >= TWO_STOP_MIN_WINDOW
          ? 2
          : 1;

  const wantStops = Math.min(maxStops, naturalStops);

  if (wantStops === 1) {
    const dur = clampMultiple(
      Math.min(MAX_SLOT_MIN, usableMin),
      5,
      MIN_SLOT_MIN
    );
    if (dur < MIN_SLOT_MIN) return [];
    const slotEnd = new Date(cursor.getTime() + dur * 60_000);
    if (overlapsAnyBusy(cursor, slotEnd, busy)) return [];
    return [makeSlot(cursor, slotEnd)];
  }

  // Multi-stop: divide window into N equal phases, anchor a 75-min slot at
  // the start of each phase.
  const windowEndMs = window.end.getTime();
  const phaseMin = usableMin / wantStops;
  const slots: TimeSlot[] = [];

  for (let i = 0; i < wantStops; i++) {
    const slotStartRaw = new Date(cursor.getTime() + i * phaseMin * 60_000);
    const slotStart = roundUpToFiveMin(slotStartRaw);
    const slotEnd = new Date(slotStart.getTime() + PREFERRED_SLOT_MIN * 60_000);

    if (slotEnd.getTime() > windowEndMs) continue;
    if (overlapsAnyBusy(slotStart, slotEnd, busy)) continue;

    slots.push(makeSlot(slotStart, slotEnd));
  }

  return slots;
}

function makeSlot(start: Date, end: Date): TimeSlot {
  return {
    startTime: fmtHHMM(start),
    endTime: fmtHHMM(end),
    startDate: start,
    endDate: end,
  };
}

function roundUpToFiveMin(d: Date): Date {
  const step = 5 * 60_000;
  return new Date(Math.ceil(d.getTime() / step) * step);
}

function clampMultiple(value: number, step: number, floor: number): number {
  const snapped = Math.floor(value / step) * step;
  return snapped < floor ? 0 : snapped;
}

// ---- LLM stop generation ----

const SYSTEM_PROMPT = `You are a Bangalore lifestyle curator for Saanjh, a daily life navigator for India.

Style:
- Editorial Indian, calm, observed. Not generic AI fluff.
- No "you'll love", no emoji, no exclamation marks.
- Max 20 words for whyThis. Short, sensory, specific.

Critical rule on whyThis:
- The whyThis line MUST be a rephrasing or excerpt of the venue's provided sensory tag.
- Do not invent details. Do not add facts not present in the tag.

You will receive ONE time slot and a small list of pre-filtered venue options. Pick the ONE venue that best fits the slot's time of day and the user's mood.

Return strict JSON only:
{ "venueId": "...", "whyThis": "..." }

Use only a venueId from the provided list. Never invent.`;

/**
 * Pick one venue for one slot. Returns a PlanStop on success, null on any
 * Groq failure or parse error. The orchestrator decides what to do with null
 * (typically: skip the slot — the SRS allows partial plans).
 */
export async function generatePlanForSlot(
  candidates: RagResult[],
  slot: TimeSlot,
  vibes: string[]
): Promise<PlanStop | null> {
  if (candidates.length === 0) return null;

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const timeOfDay = bucketForHour(slot.startDate);
  const userPrompt = buildSlotPrompt(candidates, vibes, timeOfDay, slot);

  let response: Response;
  try {
    response = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: GROQ_TEMPERATURE,
        max_tokens: 256,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  let payload: { choices?: Array<{ message?: { content?: string } }> };
  try {
    payload = await response.json();
  } catch {
    return null;
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }

  return sanitiseStop(parsed, candidates, slot);
}

function buildSlotPrompt(
  candidates: RagResult[],
  vibes: string[],
  timeOfDay: string,
  slot: TimeSlot
): string {
  const venueCards = candidates
    .map(
      (r) =>
        `[${r.venue.id}] ${r.venue.name} | ${r.venue.category} | ${r.venue.neighborhood} | ${r.venue.whyThisShort}`
    )
    .join("\n");

  return `Time of day: ${timeOfDay}
Slot: ${slot.startTime}-${slot.endTime} IST
Mood vibes: ${vibes.length ? vibes.join(", ") : "open"}

Available venues:
${venueCards}

Pick ONE venue id that best fits a ${timeOfDay} slot for this mood. Ground whyThis in that venue's actual sensory tag.`;
}

function sanitiseStop(
  raw: unknown,
  candidates: RagResult[],
  slot: TimeSlot
): PlanStop | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.venueId !== "string") return null;

  const venueMap = new Map(candidates.map((r) => [r.venue.id, r.venue]));
  const venue = venueMap.get(obj.venueId);
  if (!venue) return null;

  const rawWhy = typeof obj.whyThis === "string" ? obj.whyThis : "";
  const whyThis = truncateWords(rawWhy, 20);
  const finalWhyThis = whyThis.length > 0 ? whyThis : venue.whyThisShort;

  return {
    venueId: venue.id,
    venueName: venue.name,
    category: venue.category,
    neighborhood: venue.neighborhood,
    startTime: slot.startTime,
    endTime: slot.endTime,
    whyThis: finalWhyThis,
  };
}

// ---- Formatting helpers ----

function fmtHHMM(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function truncateWords(s: string, maxWords: number): string {
  const words = s.trim().split(/\s+/).filter(Boolean);
  return words.length <= maxWords ? words.join(" ") : words.slice(0, maxWords).join(" ");
}
