// L3 Plan generation — Saanjh's grounded LLM layer
//
// Input: time window + vibes + RagResult[] from rag.ts (already scored, filtered, ranked).
// Output: a 1-4 stop plan with timing, venue refs, and grounded why-this lines.
//
// What's deterministic (code-owned):
//   - Time slot allocation. Window length sets stop count, slots evenly spaced
//     with a 20-min transit buffer. LLM never does time math.
//   - Venue picks must come from the input RagResult set. Sanitiser rejects any
//     venue id not in the input. No hallucinated venues survive.
//   - Times formatted in IST regardless of server timezone (Vercel runs UTC).
//
// What's LLM-owned:
//   - Picking WHICH of the top-K venues fit which slots (in order).
//   - Writing the whyThis line, grounded in venue.whyThisShort sensory tag.
//   - One-line summary.
//
// Fallback: EMPTY_PLAN with aiGenerated: false when Groq fails. UI decides
// between empty state and retry — demo-safe by design.

import type { RagResult } from "@/lib/types/venue";

// NOTE: Verify model name at console.groq.com/models before relying on it.
// Groq has rotated names — if this 404s, swap and the fallback kicks in
// silently (plan goes empty). Check Groq logs if demo behaves oddly.
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

// Temperature tuned for the demo balance: low enough for rehearsal stability,
// high enough that whyThis prose doesn't feel canned.
const GROQ_TEMPERATURE = 0.3;

// IST formatting — Vercel servers run in UTC, so we explicitly format here.
const IST_TIMEZONE = "Asia/Kolkata";

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

export interface PlanContext {
  freeWindow: { start: Date; end: Date };
  vibes: string[];
  neighborhood?: string;
}

const EMPTY_PLAN: Plan = {
  stops: [],
  summary: "",
  aiGenerated: false,
};

interface TimeSlot {
  startTime: string;
  endTime: string;
}

const SYSTEM_PROMPT = `You are a Bangalore lifestyle curator for Saanjh, a daily life navigator for India.

Style:
- Editorial Indian, calm, observed. Not generic AI fluff.
- No "you'll love", no emoji, no exclamation marks.
- Max 20 words per whyThis. Short, sensory, specific.

Critical rule on whyThis:
- The whyThis line MUST be a rephrasing or excerpt of the venue's provided sensory tag.
- Do not invent details. Do not add facts not present in the tag.
- If the tag mentions "fig trees and strong wifi", whyThis can talk about fig trees and wifi. Nothing else.

Return strict JSON only:
{
  "stops": [{ "venueId": "...", "whyThis": "..." }],
  "summary": "one-line plan description, max 15 words"
}

Pick exactly the number of stops requested. Do not repeat venues. Use only venueIds from the provided list.`;

export async function generatePlan(
  candidates: RagResult[],
  context: PlanContext
): Promise<Plan> {
  if (candidates.length === 0) return EMPTY_PLAN;

  const slots = allocateSlots(context.freeWindow);
  if (slots.length === 0) return EMPTY_PLAN;

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return EMPTY_PLAN;

  const timeOfDay = deriveTimeOfDay(context.freeWindow.start);
  const userPrompt = buildUserPrompt(candidates, context.vibes, timeOfDay, slots);

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
        max_tokens: 512,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });
  } catch {
    return EMPTY_PLAN;
  }

  if (!response.ok) return EMPTY_PLAN;

  let payload: { choices?: Array<{ message?: { content?: string } }> };
  try {
    payload = await response.json();
  } catch {
    return EMPTY_PLAN;
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) return EMPTY_PLAN;

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return EMPTY_PLAN;
  }

  return sanitisePlan(parsed, candidates, slots);
}

function allocateSlots(window: { start: Date; end: Date }): TimeSlot[] {
  const totalMin = (window.end.getTime() - window.start.getTime()) / 60000;
  if (totalMin < 45) return [];

  const stopCount =
    totalMin < 90 ? 1 : totalMin < 180 ? 2 : totalMin < 300 ? 3 : 4;

  const bufferMin = 20;
  const perStop = (totalMin - bufferMin * (stopCount - 1)) / stopCount;

  const slots: TimeSlot[] = [];
  let cursor = new Date(window.start);
  for (let i = 0; i < stopCount; i++) {
    const slotEnd = new Date(cursor.getTime() + perStop * 60000);
    slots.push({
      startTime: fmtHHMM(cursor),
      endTime: fmtHHMM(slotEnd),
    });
    cursor = new Date(slotEnd.getTime() + bufferMin * 60000);
  }
  return slots;
}

function deriveTimeOfDay(d: Date): "morning" | "afternoon" | "evening" | "night" {
  // Use IST hour so the time-of-day prompt cue matches what the user is experiencing.
  const hourStr = new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    hour: "2-digit",
    hour12: false,
  }).format(d);
  const h = parseInt(hourStr, 10);
  if (h < 11) return "morning";
  if (h < 16) return "afternoon";
  if (h < 20) return "evening";
  return "night";
}

// Format any Date as IST HH:MM, regardless of server timezone.
// en-GB locale gives 24h "HH:MM" cleanly; en-IN sometimes adds AM/PM.
function fmtHHMM(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function buildUserPrompt(
  candidates: RagResult[],
  vibes: string[],
  timeOfDay: string,
  slots: TimeSlot[]
): string {
  const venueCards = candidates
    .map(
      (r) =>
        `[${r.venue.id}] ${r.venue.name} | ${r.venue.category} | ${r.venue.neighborhood} | ${r.venue.whyThisShort}`
    )
    .join("\n");

  return `Time of day: ${timeOfDay}
Mood vibes: ${vibes.length ? vibes.join(", ") : "open"}
Stops needed: ${slots.length}
Time slots (IST): ${slots.map((s, i) => `${i + 1}. ${s.startTime}-${s.endTime}`).join(" | ")}

Available venues:
${venueCards}

Pick ${slots.length} venue${slots.length > 1 ? "s" : ""} in order, one per slot. Ground each whyThis in that venue's actual sensory tag.`;
}

function sanitisePlan(
  raw: unknown,
  candidates: RagResult[],
  slots: TimeSlot[]
): Plan {
  if (!raw || typeof raw !== "object") return EMPTY_PLAN;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.stops)) return EMPTY_PLAN;

  // Map from venue id -> full VenueDTO so we can hydrate name/category/etc.
  const venueMap = new Map(candidates.map((r) => [r.venue.id, r.venue]));
  const seen = new Set<string>();
  const stops: PlanStop[] = [];

  for (let i = 0; i < slots.length; i++) {
    const s = obj.stops[i];
    if (!s || typeof s !== "object") continue;
    const stop = s as Record<string, unknown>;
    if (typeof stop.venueId !== "string") continue;

    const venue = venueMap.get(stop.venueId);
    if (!venue || seen.has(venue.id)) continue;
    seen.add(venue.id);

    const rawWhy = typeof stop.whyThis === "string" ? stop.whyThis : "";
    const whyThis = truncateWords(rawWhy, 20);

    // If the LLM returned an empty whyThis, fall back to the venue's tag.
    // Better a slightly less curated line than a visibly broken card.
    const finalWhyThis = whyThis.length > 0 ? whyThis : venue.whyThisShort;

    stops.push({
      venueId: venue.id,
      venueName: venue.name,
      category: venue.category,
      neighborhood: venue.neighborhood,
      startTime: slots[i].startTime,
      endTime: slots[i].endTime,
      whyThis: finalWhyThis,
    });
  }

  if (stops.length === 0) return EMPTY_PLAN;

  return {
    stops,
    summary:
      typeof obj.summary === "string" ? obj.summary.slice(0, 120).trim() : "",
    aiGenerated: true,
  };
}

function truncateWords(s: string, maxWords: number): string {
  const words = s.trim().split(/\s+/).filter(Boolean);
  return words.length <= maxWords ? words.join(" ") : words.slice(0, maxWords).join(" ");
}
