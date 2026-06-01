// L3 Outfit-of-the-Day generation — Saanjh's wardrobe-to-outfit layer
//
// The closet sibling of src/lib/ai/plan.ts. Same three-part shape:
//
//   - RETRIEVE (mirror of rag.ts): pull the user's tagged wardrobe_items from
//     Supabase, hard-filter to wearable categories, soft-score each item by how
//     well it fits today's occasion + mood + season, then shortlist the top few
//     per category.
//   - GENERATE (mirror of plan.ts): hand the shortlist to Groq, which picks ONE
//     coherent combination and writes the grounded "why". The sanitiser rejects
//     any item id that wasn't in the shortlist — no hallucinated garments, same
//     guarantee plan.ts gives for venues.
//   - FALLBACK: when Groq is down / keyless / returns garbage, we fall back to a
//     deterministic best-scored pick. Returns null ONLY when the closet can't
//     form a valid outfit (e.g. user has no bottoms and no dress). The Home page
//     already renders a graceful empty OutfitCard for null.
//
// What's deterministic (code-owned):
//   - Scoring + shortlisting. Occasion 0.45 / vibe 0.25 / season 0.20 / fav 0.10.
//   - Slot rules: a valid outfit is {dress} OR {top + bottom}, plus optional
//     footwear, plus outerwear ONLY in cool seasons, plus one accessory.
//   - Anti-hallucination: picks must come from the shortlisted ids.
//
// What's LLM-owned:
//   - Which specific items fill the slots, from the shortlist.
//   - The title + explanation prose, grounded in the items' actual tags.
//
// STAGE-2 SCOPE NOTE:
//   "Current season" is derived deterministically from the month (see
//   monthToSeason) — NOT from live weather. Weather + AQI are deferred to
//   stage 3. When that lands, replace the monthToSeason() call in buildContext()
//   with the real condition; everything downstream is already season-shaped, so
//   nothing else changes.

import { createAdminClient } from "@/lib/supabase/admin";
import type { OutfitRecommendation } from "@/lib/types/home";
import type { WardrobeItem } from "@/lib/types/wardrobe";
import {
  CATEGORY_LABEL,
  OCCASION_LABEL,
  WARDROBE_COLORS,
  type WardrobeCategoryId,
  type WardrobeOccasionId,
  type WardrobeSeasonId,
} from "@/lib/constants/wardrobe";
import { DEFAULT_VIBE_IMAGE } from "@/lib/constants/vibes";

// Same Groq text model + endpoint as plan.ts — keep them in sync if Groq
// rotates names. On any failure the deterministic fallback kicks in silently.
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_TEMPERATURE = 0.3;

const IST_TIMEZONE = "Asia/Kolkata";

// Scoring weights. Mirrors the rag.ts soft-score philosophy: a small set of
// orthogonal signals, summed. Tuned so occasion dominates but a strong season
// mismatch (woollens in summer) still gets pushed down.
const W_OCCASION = 0.45;
const W_VIBE = 0.25;
const W_SEASON = 0.2;
const W_FAVORITE = 0.1;

// How many candidates per category we forward to the LLM. Small on purpose —
// keeps the Groq prompt tight and the pick decisive.
const SHORTLIST_PER_CATEGORY = 3;

// ---- Public types ----

export interface OutfitContext {
  vibes: string[]; // mood vibes (VENUE_VIBES vocabulary), may be empty
  occasionHint?: WardrobeOccasionId; // derived by the orchestrator from the day
  now?: Date; // for season derivation + IST stamping; defaults to "now"
}

// A single chosen garment. Exported so persistence / a richer card can use the
// structured selection later (the current OutfitCard only needs the 4-field
// OutfitRecommendation, which composeRecommendation produces).
export interface OutfitItemPick {
  id: string;
  category: WardrobeCategoryId;
  colors: string[];
  photoUrl: string;
}

export interface OutfitSelection {
  items: OutfitItemPick[];
  title: string;
  explanation: string;
  aiGenerated: boolean;
}

// ---- Main entry ----

/**
 * Build the day's Outfit of the Day for a user. Fetches their wardrobe, scores
 * + shortlists, asks Groq to assemble, falls back deterministically, and
 * composes the OutfitRecommendation the Home card renders.
 *
 * Returns null only when the closet can't form a valid outfit. Never throws —
 * any DB / Groq failure degrades to null or to the deterministic pick.
 */
export async function generateOutfit(
  userId: string,
  context: OutfitContext
): Promise<OutfitRecommendation | null> {
  const items = await fetchWardrobe(userId);
  if (items.length === 0) return null;

  const ctx = buildContext(context);
  const shortlist = buildShortlist(items, ctx);

  // Can we even form a valid outfit? Need a dress OR (a top AND a bottom).
  if (!canFormOutfit(shortlist)) return null;

  // L3 LLM assembly, with deterministic fallback.
  const llm = await selectOutfitWithLLM(shortlist, ctx);
  const selection = llm ?? selectOutfitDeterministic(shortlist, ctx);
  if (!selection) return null;

  return composeRecommendation(selection);
}

// ---- Retrieval (mirror of rag.ts) ----

/**
 * Read the user's tagged wardrobe. Returns [] on any DB failure — the caller
 * treats that as "no outfit" rather than blowing up plan generation.
 */
async function fetchWardrobe(userId: string): Promise<WardrobeItem[]> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("wardrobe_items")
      .select("*")
      .eq("user_id", userId);

    if (error || !data) return [];
    return data as WardrobeItem[];
  } catch {
    return [];
  }
}

interface ResolvedContext {
  vibes: string[];
  targetOccasion: WardrobeOccasionId;
  desiredOccasions: Set<WardrobeOccasionId>;
  season: WardrobeSeasonId;
  now: Date;
}

function buildContext(input: OutfitContext): ResolvedContext {
  const now = input.now ?? new Date();
  const vibes = input.vibes ?? [];
  const desiredOccasions = desiredOccasionsForVibes(vibes);
  const targetOccasion =
    input.occasionHint ?? dominantOccasion(desiredOccasions);

  // STAGE 3: swap monthToSeason(now) for the live weather condition.
  const season = monthToSeason(now);

  return { vibes, targetOccasion, desiredOccasions, season, now };
}

// ---- Scoring ----

interface ScoredItem {
  item: WardrobeItem;
  score: number;
}

function scoreItem(item: WardrobeItem, ctx: ResolvedContext): number {
  const occasions = (item.occasions ?? []) as WardrobeOccasionId[];
  const seasons = (item.seasons ?? []) as WardrobeSeasonId[];

  // Occasion: exact target match is best, any desired-occasion overlap is good.
  let occasionScore = 0;
  if (occasions.includes(ctx.targetOccasion)) {
    occasionScore = 1;
  } else if (occasions.some((o) => ctx.desiredOccasions.has(o))) {
    occasionScore = 0.5;
  }

  // Vibe: fraction of the item's occasions that sit in the desired set. Rewards
  // items that are "on mood" beyond just hitting the single target occasion.
  const vibeOverlap = occasions.filter((o) =>
    ctx.desiredOccasions.has(o)
  ).length;
  const vibeScore =
    occasions.length > 0 ? Math.min(1, vibeOverlap / occasions.length) : 0;

  // Season: in-season best, all_season neutral, out-of-season penalised (not
  // zeroed — a tiny closet may have no in-season option).
  let seasonScore = 0.2;
  if (seasons.includes(ctx.season)) {
    seasonScore = 1;
  } else if (seasons.includes("all_season")) {
    seasonScore = 0.6;
  }

  const favoriteScore = item.is_favorite ? 1 : 0;

  return (
    W_OCCASION * occasionScore +
    W_VIBE * vibeScore +
    W_SEASON * seasonScore +
    W_FAVORITE * favoriteScore
  );
}

// ---- Shortlisting ----

type CategoryBuckets = Record<WardrobeCategoryId, ScoredItem[]>;

function buildShortlist(
  items: WardrobeItem[],
  ctx: ResolvedContext
): CategoryBuckets {
  const buckets: CategoryBuckets = {
    top: [],
    bottom: [],
    dress: [],
    outerwear: [],
    footwear: [],
    accessory: [],
  };

  for (const item of items) {
    const cat = item.category as WardrobeCategoryId | null;
    if (!cat || !(cat in buckets)) continue; // skip untagged / unknown category
    buckets[cat].push({ item, score: scoreItem(item, ctx) });
  }

  // Sort each bucket by score DESC, keep the top N.
  (Object.keys(buckets) as WardrobeCategoryId[]).forEach((cat) => {
    buckets[cat].sort((a, b) => b.score - a.score);
    buckets[cat] = buckets[cat].slice(0, SHORTLIST_PER_CATEGORY);
  });

  return buckets;
}

function canFormOutfit(shortlist: CategoryBuckets): boolean {
  const hasDress = shortlist.dress.length > 0;
  const hasTopAndBottom =
    shortlist.top.length > 0 && shortlist.bottom.length > 0;
  return hasDress || hasTopAndBottom;
}

// ---- L3 LLM assembly (mirror of plan.ts generatePlanForSlot) ----

const SYSTEM_PROMPT = `You are a personal stylist for Saanjh, a daily life navigator for India.

Style:
- Editorial Indian, calm, observed. Not generic AI fluff.
- No "you'll love", no emoji, no exclamation marks.

Your job: from the user's OWN wardrobe items (listed with ids), assemble ONE outfit that fits today's occasion, mood and season.

A valid outfit is EITHER:
  - one "dress" item, OR
  - one "top" item AND one "bottom" item.
Optionally add: one "footwear", one "outerwear" (only if it suits the season), one "accessory".

Critical rules:
- Use ONLY item ids from the provided list. Never invent an id or a garment.
- title: max 6 words, names the outfit by its key pieces or feel (e.g. "Olive linen, unhurried morning").
- explanation: max 32 words, grounded in the actual items' colours/occasions. Say why this works for the day. No invented fabrics or brands.

Return strict JSON only, no markdown:
{
  "dressId": "..." | null,
  "topId": "..." | null,
  "bottomId": "..." | null,
  "footwearId": "..." | null,
  "outerwearId": "..." | null,
  "accessoryId": "..." | null,
  "title": "...",
  "explanation": "..."
}`;

async function selectOutfitWithLLM(
  shortlist: CategoryBuckets,
  ctx: ResolvedContext
): Promise<OutfitSelection | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const userPrompt = buildOutfitPrompt(shortlist, ctx);

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
        max_tokens: 384,
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

  return sanitiseSelection(parsed, shortlist, ctx);
}

function buildOutfitPrompt(
  shortlist: CategoryBuckets,
  ctx: ResolvedContext
): string {
  const lines: string[] = [];
  (Object.keys(shortlist) as WardrobeCategoryId[]).forEach((cat) => {
    for (const { item } of shortlist[cat]) {
      lines.push(formatItemCard(cat, item));
    }
  });

  return `Occasion: ${OCCASION_LABEL[ctx.targetOccasion] ?? ctx.targetOccasion}
Mood vibes: ${ctx.vibes.length ? ctx.vibes.join(", ") : "open"}
Season: ${ctx.season}

Wardrobe items:
${lines.join("\n")}

Assemble ONE outfit from these ids that fits a ${ctx.season} ${
    OCCASION_LABEL[ctx.targetOccasion] ?? ctx.targetOccasion
  } day with this mood. Ground the explanation in the items' actual colours and tags.`;
}

function formatItemCard(cat: WardrobeCategoryId, item: WardrobeItem): string {
  const colours = (item.colors ?? []).map(colorLabel).join("/") || "neutral";
  const occ = (item.occasions ?? []).join(", ") || "any";
  const seas = (item.seasons ?? []).join(", ") || "all_season";
  return `[${item.id}] ${cat} | ${colours} | occasions: ${occ} | seasons: ${seas}`;
}

/**
 * Validate the LLM's pick against the shortlist and the outfit rules. Any id
 * not in the shortlist is dropped. If what survives isn't a valid outfit, we
 * bail to null so the caller falls back to the deterministic pick.
 */
function sanitiseSelection(
  raw: unknown,
  shortlist: CategoryBuckets,
  ctx: ResolvedContext
): OutfitSelection | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const idIn = (
    cat: WardrobeCategoryId,
    field: unknown
  ): OutfitItemPick | null => {
    if (typeof field !== "string") return null;
    const found = shortlist[cat].find((s) => s.item.id === field);
    return found ? toPick(cat, found.item) : null;
  };

  const dress = idIn("dress", obj.dressId);
  const top = idIn("top", obj.topId);
  const bottom = idIn("bottom", obj.bottomId);
  const footwear = idIn("footwear", obj.footwearId);
  const accessory = idIn("accessory", obj.accessoryId);
  // Outerwear only honoured in cool seasons even if the LLM suggests it.
  const outerwear = isCoolSeason(ctx.season)
    ? idIn("outerwear", obj.outerwearId)
    : null;

  const items = assembleValidItems({ dress, top, bottom, footwear, outerwear, accessory });
  if (!items) return null;

  const title = cleanText(obj.title, 6) || defaultTitle(items);
  const explanation =
    cleanText(obj.explanation, 32) || defaultExplanation(items, ctx);

  return { items, title, explanation, aiGenerated: true };
}

// ---- Deterministic fallback (mirror of plan.ts deterministic guards) ----

function selectOutfitDeterministic(
  shortlist: CategoryBuckets,
  ctx: ResolvedContext
): OutfitSelection | null {
  const bestDress = shortlist.dress[0];
  const bestTop = shortlist.top[0];
  const bestBottom = shortlist.bottom[0];

  // Prefer a dress only if it out-scores the top+bottom average; otherwise
  // build a two-piece. Keeps single strong pieces from losing to weak pairs.
  const pairScore =
    bestTop && bestBottom ? (bestTop.score + bestBottom.score) / 2 : -1;
  const dressScore = bestDress ? bestDress.score : -1;

  let core: OutfitItemPick[] = [];
  if (dressScore >= pairScore && bestDress) {
    core = [toPick("dress", bestDress.item)];
  } else if (bestTop && bestBottom) {
    core = [toPick("top", bestTop.item), toPick("bottom", bestBottom.item)];
  } else {
    return null;
  }

  if (shortlist.footwear[0]) {
    core.push(toPick("footwear", shortlist.footwear[0].item));
  }
  if (isCoolSeason(ctx.season) && shortlist.outerwear[0]) {
    core.push(toPick("outerwear", shortlist.outerwear[0].item));
  }
  if (shortlist.accessory[0]) {
    core.push(toPick("accessory", shortlist.accessory[0].item));
  }

  return {
    items: core,
    title: defaultTitle(core),
    explanation: defaultExplanation(core, ctx),
    aiGenerated: false,
  };
}

// ---- Composition into the Home card shape ----

function composeRecommendation(selection: OutfitSelection): OutfitRecommendation {
  const hero = pickHero(selection.items);
  const subtitleParts = selection.items
    .map((i) => CATEGORY_LABEL[i.category] ?? i.category)
    .slice(0, 4);

  return {
    imageUrl: hero?.photoUrl || DEFAULT_VIBE_IMAGE,
    title: selection.title,
    subtitle: subtitleParts.join(" · "),
    explanation: selection.explanation,
  };
}

// The hero image is the most "outfit-defining" piece present.
function pickHero(items: OutfitItemPick[]): OutfitItemPick | undefined {
  const order: WardrobeCategoryId[] = [
    "dress",
    "top",
    "outerwear",
    "bottom",
    "footwear",
    "accessory",
  ];
  for (const cat of order) {
    const found = items.find((i) => i.category === cat && i.photoUrl);
    if (found) return found;
  }
  return items[0];
}

// ---- Small helpers ----

function assembleValidItems(picks: {
  dress: OutfitItemPick | null;
  top: OutfitItemPick | null;
  bottom: OutfitItemPick | null;
  footwear: OutfitItemPick | null;
  outerwear: OutfitItemPick | null;
  accessory: OutfitItemPick | null;
}): OutfitItemPick[] | null {
  const items: OutfitItemPick[] = [];

  // Core must be a dress OR a top+bottom pair. A dress wins if both are offered.
  if (picks.dress) {
    items.push(picks.dress);
  } else if (picks.top && picks.bottom) {
    items.push(picks.top, picks.bottom);
  } else {
    return null;
  }

  if (picks.footwear) items.push(picks.footwear);
  if (picks.outerwear) items.push(picks.outerwear);
  if (picks.accessory) items.push(picks.accessory);
  return items;
}

function toPick(cat: WardrobeCategoryId, item: WardrobeItem): OutfitItemPick {
  return {
    id: item.id,
    category: cat,
    colors: item.colors ?? [],
    photoUrl: item.photo_url,
  };
}

// Vibe -> desired wardrobe occasions. Closed mapping over the 8 VENUE_VIBES.
function desiredOccasionsForVibes(
  vibes: string[]
): Set<WardrobeOccasionId> {
  const map: Record<string, WardrobeOccasionId[]> = {
    chill: ["casual", "loungewear"],
    contemplative: ["casual"],
    quiet: ["casual", "work"],
    productive: ["work", "casual"],
    social: ["casual", "festive"],
    lively: ["festive", "casual"],
    romantic: ["festive", "formal"],
    adventurous: ["casual", "workout"],
  };

  const set = new Set<WardrobeOccasionId>();
  for (const v of vibes) {
    for (const occ of map[v] ?? []) set.add(occ);
  }
  // Default to casual when no vibe signal — the safe everyday baseline.
  if (set.size === 0) set.add("casual");
  return set;
}

function dominantOccasion(
  desired: Set<WardrobeOccasionId>
): WardrobeOccasionId {
  // Priority order when several vibes pull in different directions.
  const priority: WardrobeOccasionId[] = [
    "work",
    "festive",
    "formal",
    "workout",
    "casual",
    "loungewear",
  ];
  for (const occ of priority) {
    if (desired.has(occ)) return occ;
  }
  return "casual";
}

// Deterministic season from the IST month. STAGE-2 stand-in for live weather.
function monthToSeason(now: Date): WardrobeSeasonId {
  const month = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: IST_TIMEZONE,
      month: "numeric",
    }).format(now)
  ); // 1..12

  if (month >= 3 && month <= 6) return "summer"; // Mar–Jun
  if (month >= 7 && month <= 9) return "monsoon"; // Jul–Sep
  return "winter"; // Oct–Feb
}

function isCoolSeason(season: WardrobeSeasonId): boolean {
  return season === "winter" || season === "monsoon";
}

function colorLabel(id: string): string {
  const match = WARDROBE_COLORS.find((c) => c.id === id);
  if (match) return match.label;
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : id;
}

function defaultTitle(items: OutfitItemPick[]): string {
  // e.g. "Navy top, beige bottom" — built from the core pieces' colours.
  const core = items.filter(
    (i) => i.category === "dress" || i.category === "top" || i.category === "bottom"
  );
  const parts = core.slice(0, 2).map((i) => {
    const colour = i.colors[0] ? colorLabel(i.colors[0]) : "";
    const cat = (CATEGORY_LABEL[i.category] ?? i.category).toLowerCase();
    return colour ? `${colour} ${cat}` : cat;
  });
  return parts.length ? parts.join(", ") : "Your outfit for today";
}

function defaultExplanation(
  items: OutfitItemPick[],
  ctx: ResolvedContext
): string {
  const occ = (OCCASION_LABEL[ctx.targetOccasion] ?? ctx.targetOccasion).toLowerCase();
  const pieces = items
    .map((i) => (CATEGORY_LABEL[i.category] ?? i.category).toLowerCase())
    .slice(0, 3)
    .join(", ");
  return `Picked from your closet for a ${occ} ${ctx.season} day — ${pieces}, easy to wear and on mood.`;
}

// Clean LLM text: trim, strip surrounding quotes, cap word count.
function cleanText(value: unknown, maxWords: number): string {
  if (typeof value !== "string") return "";
  const words = value.trim().replace(/^"|"$/g, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  return words.slice(0, maxWords).join(" ");
}
