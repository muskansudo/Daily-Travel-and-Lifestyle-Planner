// src/lib/ai/composeDay.ts
//
// Design Doc §11 — the composition brain.
//
// Replaces the per-slot "pick ONE from a pre-sorted list" loop (which the
// reviewers correctly called redundant) with a SINGLE whole-day call that
// assembles AND sequences the day, reasoning over the candidate SET — arc,
// variety, weather/AQI, vibe — the things a per-venue scorer is blind to.
//
// The LLM runs inside a deterministic cage:
//   Layer 1 (WINDOW)     — quietHours.ts + horizon.ts decide which slots exist.
//   Layer 2 (CANDIDATES) — rag.ts time-of-day filter decides what's eligible.
//   Layer 3a (COMPOSE)   — THIS FILE: one Groq call proposes the day.
//   Layer 3b (VALIDATE)  — THIS FILE: code guarantees the hard invariants.
//
// Hard rules live in code; only soft judgment lives in the model. Even a wrong
// model output is a VALID day, because the cage repairs any violation.

import type { RagResult, VenueDTO } from "@/lib/types/venue";
import type { Plan, PlanStop, TimeSlot } from "@/lib/ai/plan";
import { bucketForHour } from "@/lib/constants/venues";

// Mirror plan.ts's Groq config locally so this module is self-contained.
// Keep in sync with src/lib/ai/plan.ts if the model name rotates.
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
// Slightly higher than per-slot (0.3): composition benefits from a little
// variety in sequencing, while the cage still guarantees correctness.
const GROQ_TEMPERATURE = 0.4;
const COMPOSE_MAX_TOKENS = 700;

// Categories that count as "a meal" for the no-food-after-food rule.
// Tune to your venue corpus. `bar` is intentionally excluded (a drink after
// dinner is fine; two meals back-to-back is the thing we forbid).
const MEAL_CATEGORIES = new Set([
  "restaurant",
  "cafe",
  "dining",
  "dessert",
  "bakery",
  "street_food",
]);

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SlotPool {
  slot: TimeSlot;
  /** RAG-filtered + time-of-day-gated candidates (Layer 2 output). */
  candidates: RagResult[];
  /** Repair path: this slot is locked. The LLM and cage must not move it. */
  pinned?: PlanStop;
}

export interface ComposeWeather {
  tempC?: number;
  condition?: string; // e.g. "rain", "clear"
  aqi?: number;
  aqiLabel?: string; // e.g. "Poor"
}

export interface ComposeDayInput {
  /** Chronological. One pool per slot from allocateSlots(). */
  pools: SlotPool[];
  vibes: string[];
  /** User interests — drives the ≥1-interest-venue guarantee. */
  interestTags: string[];
  weather?: ComposeWeather;
  collaborative?: { friendDisplayName: string };
  /**
   * Agent-repair only: an extra natural-language constraint describing the
   * disruption (e.g. "It is raining — avoid outdoor venues."). Soft-guides the
   * LLM; hard correctness still comes from the candidate pools you pass in.
   */
  extraConstraint?: string;
}

// ---------------------------------------------------------------------------
// Internal assignment model (kept aligned 1:1 with pools by index)
// ---------------------------------------------------------------------------

interface Assigned {
  pool: SlotPool;
  venue: VenueDTO | null; // null = unfilled (no candidate available)
  why: string;
  pinned: boolean;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function composeDay(input: ComposeDayInput): Promise<Plan> {
  const { pools, vibes, interestTags, weather } = input;

  // 1. Deterministic baseline = the reliable floor. If the LLM is unavailable
  //    or fails, THIS is what ships — a valid top-of-RAG day, never a crash.
  let assigned = deterministicCompose(pools);

  // 2. Try LLM composition. Only override non-pinned slots that the model
  //    picked validly; everything else keeps the deterministic baseline.
  const apiKey = process.env.GROQ_API_KEY;
  const hasPlannable = pools.some((p) => !p.pinned && p.candidates.length > 0);
  let aiGenerated = false;

  if (apiKey && hasPlannable) {
    const picks = await composeViaGroq(apiKey, input);
    if (picks) {
      assigned = applyLlmPicks(assigned, picks);
      aiGenerated = true;
    }
  }

  // 3. Run the cage (ALWAYS — guards both the LLM and the deterministic path).
  assigned = enforceNoFoodAdjacency(assigned);
  assigned = enforceInterestCoverage(assigned, interestTags);

  // 4. Emit.
  const stops = assigned
    .filter((a): a is Assigned & { venue: VenueDTO } => a.venue !== null)
    .map((a) => toPlanStop(a));

  return {
    stops,
    summary: buildSummary(stops, vibes, weather),
    aiGenerated,
  };
}

// ---------------------------------------------------------------------------
// Layer 3a — deterministic baseline + LLM merge
// ---------------------------------------------------------------------------

function deterministicCompose(pools: SlotPool[]): Assigned[] {
  const used = new Set<string>();
  return pools.map((pool) => {
    if (pool.pinned) {
      used.add(pool.pinned.venueId);
      return {
        pool,
        venue: pinnedVenue(pool),
        why: pool.pinned.whyThis,
        pinned: true,
      };
    }
    const pick = topOfRag(pool.candidates, used);
    if (!pick) return { pool, venue: null, why: "", pinned: false };
    used.add(pick.venue.id);
    return {
      pool,
      venue: pick.venue,
      why: pick.venue.whyThisShort,
      pinned: false,
    };
  });
}

interface LlmPick {
  slotIndex: number;
  venueId: string;
  whyThis: string;
}

/**
 * Apply the LLM's picks on top of the deterministic baseline. A pick is only
 * honoured if the venueId actually exists in THAT slot's candidate set and is
 * not already used — so the model can never inject a hallucinated or
 * cross-slot venue (the Layer-2 guarantee survives).
 */
function applyLlmPicks(base: Assigned[], picks: LlmPick[]): Assigned[] {
  const next = base.map((a) => ({ ...a }));
  const used = new Set<string>();
  for (const a of next) if (a.venue) used.add(a.venue.id);

  for (const pick of picks) {
    const a = next[pick.slotIndex];
    if (!a || a.pinned) continue;
    const match = a.pool.candidates.find((r) => r.venue.id === pick.venueId);
    if (!match) continue; // not in this slot's eligible set — reject
    if (a.venue && a.venue.id === match.venue.id) {
      a.why = sanitiseWhy(pick.whyThis, match.venue);
      continue;
    }
    if (used.has(match.venue.id)) continue; // already placed elsewhere
    if (a.venue) used.delete(a.venue.id);
    a.venue = match.venue;
    a.why = sanitiseWhy(pick.whyThis, match.venue);
    used.add(match.venue.id);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Layer 3b — the cage (deterministic hard-rule enforcement)
// ---------------------------------------------------------------------------

/** No two consecutive stops may both be meal categories. */
function enforceNoFoodAdjacency(assigned: Assigned[]): Assigned[] {
  const out = assigned.map((a) => ({ ...a }));
  const used = new Set<string>();
  for (const a of out) if (a.venue) used.add(a.venue.id);

  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1];
    const cur = out[i];
    if (!prev.venue || !cur.venue) continue;
    if (!isMeal(prev.venue) || !isMeal(cur.venue)) continue;

    // Prefer to re-pick the later, non-pinned stop; else the earlier one.
    const target = !cur.pinned ? cur : !prev.pinned ? prev : null;
    if (!target) continue; // both pinned — cannot fix

    const swap = topOfRag(
      target.pool.candidates,
      used,
      (v) => !isMeal(v), // require a non-meal replacement
    );
    if (!swap) continue;
    used.delete(target.venue!.id);
    target.venue = swap.venue;
    target.why = swap.venue.whyThisShort;
    used.add(swap.venue.id);
  }
  return out;
}

/** The day must contain at least one venue matching a user interest. */
function enforceInterestCoverage(
  assigned: Assigned[],
  interestTags: string[],
): Assigned[] {
  if (interestTags.length === 0) return assigned;
  const covered = assigned.some(
    (a) => a.venue && coversInterest(a.venue, interestTags),
  );
  if (covered) return assigned;

  const out = assigned.map((a) => ({ ...a }));
  const used = new Set<string>();
  for (const a of out) if (a.venue) used.add(a.venue.id);

  // Find a non-pinned slot that has an interest candidate available, and swap.
  for (const a of out) {
    if (a.pinned) continue;
    const swap = topOfRag(a.pool.candidates, used, (v) =>
      coversInterest(v, interestTags),
    );
    if (!swap) continue;
    if (a.venue) used.delete(a.venue.id);
    a.venue = swap.venue;
    a.why = swap.venue.whyThisShort;
    used.add(swap.venue.id);
    break; // one interest venue satisfies the rule
  }
  return out;
}

// ---------------------------------------------------------------------------
// Groq call
// ---------------------------------------------------------------------------

async function composeViaGroq(
  apiKey: string,
  input: ComposeDayInput,
): Promise<LlmPick[] | null> {
  const userPrompt = buildComposePrompt(input);

  for (let attempt = 0; attempt < 2; attempt++) {
    console.log(
      "[composeDay] Groq call — pools this window:",
      input.pools.length,
    );
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
          max_tokens: COMPOSE_MAX_TOKENS,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: COMPOSE_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
        }),
      });
    } catch {
      return null; // network error — caller keeps the deterministic baseline
    }

    if (response.status === 429 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 1200));
      continue;
    }
    if (!response.ok) return null;

    try {
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) return null;
      return parsePicks(JSON.parse(content));
    } catch {
      return null;
    }
  }
  return null;
}

const COMPOSE_SYSTEM_PROMPT = `You are a Bangalore lifestyle curator for Saanjh. You are given the WHOLE day at once: an ordered list of time slots, each with a few pre-filtered, eligible venue options. Your job is to compose a coherent day, not to score venues.

Rules:
- Choose exactly one venue id PER non-fixed slot, only from that slot's options.
- Sequence for variety and a natural energy arc; do not pick two food/meal venues back to back.
- Respect the weather: if it is raining or AQI is poor, prefer indoor venues and avoid long outdoor stops.
- Honour the mood/vibes.
- Ground each whyThis (<= 20 words) in the chosen venue's actual tag and the day's context, not generic praise.
- Fixed slots are already decided — keep them; plan the rest around them.

Output JSON only, no prose: {"stops":[{"slotIndex":<int>,"venueId":"<id>","whyThis":"<text>"}]}`;

function buildComposePrompt(input: ComposeDayInput): string {
  const { pools, vibes, weather, collaborative, extraConstraint } = input;

  const slotBlocks = pools
    .map((pool, i) => {
      if (pool.pinned) {
        return `Slot ${i} [${pool.slot.startTime}-${pool.slot.endTime}, ${bucketForHour(
          pool.slot.startDate,
        )}] FIXED: ${pool.pinned.venueName} (${pool.pinned.category}). Do not change.`;
      }
      const cards = pool.candidates
        .map(
          (r) =>
            `  [${r.venue.id}] ${r.venue.name} | ${r.venue.category} | ${r.venue.neighborhood} | ${r.venue.whyThisShort}`,
        )
        .join("\n");
      return `Slot ${i} [${pool.slot.startTime}-${pool.slot.endTime}, ${bucketForHour(
        pool.slot.startDate,
      )}] — pick one:\n${cards}`;
    })
    .join("\n\n");

  const lines = [
    collaborative
      ? `Joint outing for you and ${collaborative.friendDisplayName} — pick venues that suit both.`
      : "",
    `Mood vibes: ${vibes.length ? vibes.join(", ") : "open"}`,
    weather ? `Weather: ${formatWeather(weather)}` : "",
    extraConstraint ? `Constraint: ${extraConstraint}` : "",
    "",
    slotBlocks,
    "",
    `Return one pick per non-fixed slot as JSON.`,
  ];
  return lines.filter(Boolean).join("\n");
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function topOfRag(
  candidates: RagResult[],
  used: Set<string>,
  predicate?: (v: VenueDTO) => boolean,
): RagResult | null {
  for (const r of candidates) {
    if (used.has(r.venue.id)) continue;
    if (predicate && !predicate(r.venue)) continue;
    return r;
  }
  return null;
}

function isMeal(v: VenueDTO): boolean {
  return MEAL_CATEGORIES.has(v.category.toLowerCase());
}

function coversInterest(v: VenueDTO, interestTags: string[]): boolean {
  const set = new Set(interestTags.map((t) => t.toLowerCase()));
  return v.interestTags.some((t) => set.has(t.toLowerCase()));
}

function pinnedVenue(pool: SlotPool): VenueDTO | null {
  if (!pool.pinned) return null;
  const match = pool.candidates.find(
    (r) => r.venue.id === pool.pinned!.venueId,
  );
  // The pinned stop may not be in the (rebuilt) candidate set; synthesise a
  // minimal VenueDTO from the PlanStop so it still renders and counts in rules.
  return (
    match?.venue ?? {
      id: pool.pinned.venueId,
      name: pool.pinned.venueName,
      category: pool.pinned.category,
      neighborhood: pool.pinned.neighborhood,
      lat: 0,
      lng: 0,
      dietaryTags: [],
      vibeTags: [],
      interestTags: [],
      timeOfDayFit: [],
      priceTier: 0,
      openingHours: null,
      whyThisShort: pool.pinned.whyThis,
      imageUrl: null,
    }
  );
}

function toPlanStop(a: Assigned & { venue: VenueDTO }): PlanStop {
  return {
    venueId: a.venue.id,
    venueName: a.venue.name,
    category: a.venue.category,
    neighborhood: a.venue.neighborhood,
    startTime: a.pool.slot.startTime,
    endTime: a.pool.slot.endTime,
    whyThis: a.why || a.venue.whyThisShort,
  };
}

function sanitiseWhy(raw: unknown, venue: VenueDTO): string {
  const s = typeof raw === "string" ? truncateWords(raw, 20) : "";
  return s.length > 0 ? s : venue.whyThisShort;
}

function parsePicks(raw: unknown): LlmPick[] | null {
  if (!raw || typeof raw !== "object") return null;
  const arr = (raw as { stops?: unknown }).stops;
  if (!Array.isArray(arr)) return null;
  const out: LlmPick[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.slotIndex !== "number" || typeof o.venueId !== "string")
      continue;
    out.push({
      slotIndex: o.slotIndex,
      venueId: o.venueId,
      whyThis: typeof o.whyThis === "string" ? o.whyThis : "",
    });
  }
  return out.length > 0 ? out : null;
}

function formatWeather(w: ComposeWeather): string {
  const parts: string[] = [];
  if (w.condition) parts.push(w.condition);
  if (typeof w.tempC === "number") parts.push(`${Math.round(w.tempC)}°C`);
  if (w.aqiLabel || typeof w.aqi === "number") {
    parts.push(
      `AQI ${w.aqiLabel ?? ""}${typeof w.aqi === "number" ? ` (${w.aqi})` : ""}`.trim(),
    );
  }
  return parts.join(", ");
}

function buildSummary(
  stops: PlanStop[],
  vibes: string[],
  weather?: ComposeWeather,
): string {
  if (stops.length === 0) return "";
  const hoods = Array.from(new Set(stops.map((s) => s.neighborhood))).slice(
    0,
    3,
  );
  const vibe = vibes.length ? vibes[0] : "easy";
  const where = hoods.length ? ` across ${hoods.join(", ")}` : "";
  const wx =
    weather?.condition && /rain/i.test(weather.condition)
      ? " — kept indoors for the rain"
      : "";
  return `A ${vibe} day${where}${wx}.`;
}

function truncateWords(s: string, maxWords: number): string {
  const words = s.trim().split(/\s+/);
  if (words.length <= maxWords) return s.trim();
  return words.slice(0, maxWords).join(" ");
}
