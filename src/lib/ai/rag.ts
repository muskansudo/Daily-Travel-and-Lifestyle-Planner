// L2 Retrieval — Saanjh's RAG layer
//
// Architecture: hand-tagged Bangalore venue corpus in Supabase (Postgres GIN
// indexes on tag arrays). Per-slot retrieval — the orchestrator calls this once
// per slot in the day's plan, passing the slot's time-of-day bucket as a HARD
// FILTER. A 20:00 dinner slot never sees a venue tagged morning-only.
//
// Retrieval pipeline:
//
//   1. HARD FILTERS (SQL): dietary, allowed categories/neighborhoods, time-of-
//      day bucket overlap, category exclusion (for day-wide diversity).
//      Anything that violates a hard filter is dropped — we don't rank-then-hope.
//
//   2. SOFT SCORING (in-process): weighted sum of interest overlap, vibe
//      overlap (from L1 mood image), and distance from the bias point. Open-
//      hours acts multiplicatively (drops score to 0 when closed).
//
//   3. INTEREST COVERAGE: bucket the top-scored candidates by which user
//      interest they best match. Take 1 from each interest bucket first, then
//      fill remaining slots by raw score. Ensures a coffee + art + walks user
//      sees variety, not 8 cafes.
//
//   4. INTERNAL FALLBACK CHAIN: if the initial query returns zero, retry with
//      relaxed constraints (drop category exclusion, drop interest coverage,
//      widen time bucket). Critical with our 79-venue corpus — the orchestrator
//      depends on retrieval to always come back with something pickable.
//
// Why not vector embeddings: corpus is small and hand-tagged, set overlap beats
// cosine here, and every recommendation produces an explainable "why this".
//
// L3 (Groq generation) consumes the top-K RagResult[] and grounds its plan
// output in these specific venues. The LLM never invents a venue.

import { createAdminClient } from "@/lib/supabase/admin";
import {
  toVenueDTO,
  type RagInputs,
  type RagResult,
  type Venue,
} from "@/lib/types/venue";
import {
  DEFAULT_BIAS_LATLNG,
  widenBucket,
  type TimeOfDayBucket,
} from "@/lib/constants/venues";

// Scoring weights. Design doc section 6: interest dominates because time-of-day
// is already a hard filter and category diversity is enforced by the
// orchestrator — weights only matter for tiebreaks within an already-curated set.
const WEIGHTS = {
  interest: 0.6,
  vibe: 0.3,
  distance: 0.1,
} as const;

const IST_TIMEZONE = "Asia/Kolkata";
const MIN_PLAN_STOP_MINUTES = 45;

const DIETARY_ALIASES: Record<string, string> = {
  jain: "jain_friendly",
};

/** Onboarding dietary ids that are not in the venue corpus — skip hard filtering. */
const NON_VENUE_DIETARY = new Set(["keto"]);

// Earth radius for haversine, in km.
const EARTH_KM = 6371;

// Anything beyond this radius gets the worst distance score. 8km is roughly
// the diameter of the active Bangalore corpus (Bagmane to MG Road).
const MAX_DISTANCE_KM = 8;

/**
 * Public entry point. Takes user signals + slot context, returns ranked
 * venues with per-signal breakdowns. Deterministic — same inputs → same outputs.
 *
 * Walks the fallback chain (design doc section 10) automatically:
 *   step 1: full filters (time bucket + category exclusion + interest coverage)
 *   step 2: drop category exclusion
 *   step 3: drop interest coverage
 *   step 4: widen time bucket
 * Returns whatever the first non-empty step produces.
 */
export async function retrieveVenues(inputs: RagInputs): Promise<RagResult[]> {
  const topK = inputs.topK ?? 8;
  const bucket = inputs.timeOfDay as TimeOfDayBucket | undefined;

  // Step 1: tightest possible filter — primary bucket + category exclusion +
  // interest coverage applied during ranking.
  let results = await fetchAndScore(inputs, {
    buckets: bucket ? [bucket] : undefined,
    excludeCategories: inputs.excludeCategories ?? [],
  });
  if (results.length > 0) {
    return applyInterestCoverage(results, inputs.interestTags, topK);
  }

  // Step 2: drop category exclusion. Better a repeated category than an empty slot.
  results = await fetchAndScore(inputs, {
    buckets: bucket ? [bucket] : undefined,
    excludeCategories: [],
  });
  if (results.length > 0) {
    return applyInterestCoverage(results, inputs.interestTags, topK);
  }

  // Step 3: drop interest coverage. Just take top-K by raw score.
  results = await fetchAndScore(inputs, {
    buckets: bucket ? [bucket] : undefined,
    excludeCategories: [],
  });
  if (results.length > 0) {
    return results.slice(0, topK);
  }

  // Step 4: widen the time bucket. An evening slot now accepts afternoon +
  // evening + night venues.
  if (bucket) {
    results = await fetchAndScore(inputs, {
      buckets: widenBucket(bucket),
      excludeCategories: [],
    });
    if (results.length > 0) {
      return results.slice(0, topK);
    }
  }

  // Step 5: no time bucket at all — give the orchestrator something to work
  // with. The route's filterOverlappingStops audit will still drop unsafe
  // slots; this just makes sure rag.ts never returns [] when the corpus has
  // venues.
  results = await fetchAndScore(inputs, {
    buckets: undefined,
    excludeCategories: [],
  });
  return results.slice(0, topK);
}

// ---- Internal pipeline ----

interface FetchOptions {
  buckets?: TimeOfDayBucket[]; // undefined = no time-of-day filter
  excludeCategories: string[];
}

async function fetchAndScore(
  inputs: RagInputs,
  opts: FetchOptions
): Promise<RagResult[]> {
  const supabase = createAdminClient();

  // ---- Phase 1: hard filters in SQL ----
  let query = supabase.from("venues").select("*");

  if (inputs.allowedCategories && inputs.allowedCategories.length > 0) {
    query = query.in("category", inputs.allowedCategories);
  }
  if (opts.excludeCategories.length > 0) {
    // Exclude categories already used today (day-wide diversity).
    // Postgres: NOT IN list.
    for (const cat of opts.excludeCategories) {
      query = query.neq("category", cat);
    }
  }
  if (inputs.allowedNeighborhoods && inputs.allowedNeighborhoods.length > 0) {
    query = query.in("neighborhood", inputs.allowedNeighborhoods);
  }

  // Budget filter — hard cap on price_tier. A "light budget" user (tier 1)
  // never sees a ₹₹₹ venue. This is a real SQL filter on the price_tier
  // column, not a vibe nudge.
  if (typeof inputs.maxPriceTier === "number") {
    query = query.lte("price_tier", inputs.maxPriceTier);
  }

  // Time-of-day filter — overlap on the time_of_day_fit array.
  if (opts.buckets && opts.buckets.length > 0) {
    query = query.overlaps("time_of_day_fit", opts.buckets);
  }

  // Dietary filter. A vegan user must NOT see a venue tagged only
  // "no_restrictions" — that's a meat-friendly place. We only accept exact
  // tag overlap. The vegan user wants real vegan options.
  const strictDiet = inputs.dietaryTags.includes("no_restrictions")
    ? []
    : normalizeDietaryTags(inputs.dietaryTags).filter(
        (t) => t !== "no_restrictions"
      );
  if (strictDiet.length > 0) {
    query = query.overlaps("dietary_tags", strictDiet);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Venue retrieval failed: ${error.message}`);
  }
  const candidates = (data ?? []) as Venue[];
  if (candidates.length === 0) return [];

  // ---- Phase 2: score in-process ----
  const biasLat = inputs.biasLat ?? DEFAULT_BIAS_LATLNG.lat;
  const biasLng = inputs.biasLng ?? DEFAULT_BIAS_LATLNG.lng;

  const scored: RagResult[] = candidates.map((v) => {
    const interestScore = jaccardLike(inputs.interestTags, v.interest_tags);
    const vibeScore =
      inputs.moodVibes && inputs.moodVibes.length > 0
        ? jaccardLike(inputs.moodVibes, v.vibe_tags)
        : 0;

    const distanceKm = haversineKm(biasLat, biasLng, Number(v.lat), Number(v.lng));
    const distanceScore = Math.max(0, 1 - distanceKm / MAX_DISTANCE_KM);

    const openNow = inputs.windowStart
      ? isOpenForPlanWindow(
          v.opening_hours,
          inputs.windowStart,
          MIN_PLAN_STOP_MINUTES
        )
      : true;

    const base =
      WEIGHTS.interest * interestScore +
      WEIGHTS.vibe * vibeScore +
      WEIGHTS.distance * distanceScore;

    const score = openNow ? base : 0;

    return {
      venue: toVenueDTO(v),
      score,
      breakdown: {
        dietary: true,
        interest: interestScore,
        vibe: vibeScore,
        distance: distanceScore,
        openNow,
      },
    };
  });

  // Sort by score desc, tiebreak by venue id for determinism.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.venue.id < b.venue.id ? -1 : 1;
  });

  // Drop zero-scored (closed during window) so the LLM never sees them.
  return scored.filter((r) => r.score > 0);
}

/**
 * Interest coverage pass — ensures the returned set spans the user's stated
 * interests when possible. Design doc section 6.
 *
 * Bucket scored results by which user interest they best match (highest tag
 * overlap with that interest). Take 1 from each interest bucket first, in
 * score order. Then fill remaining slots by raw score.
 *
 * Effect: a user who picked cafe + art + walks sees one of each at the top,
 * not eight cafes.
 */
function applyInterestCoverage(
  scored: RagResult[],
  userInterests: string[],
  topK: number
): RagResult[] {
  if (userInterests.length === 0 || scored.length <= topK) {
    return scored.slice(0, topK);
  }

  // Map: interest -> list of results that match it (sorted by score desc).
  const byInterest = new Map<string, RagResult[]>();
  for (const interest of userInterests) {
    const matches = scored.filter((r) => r.venue.interestTags.includes(interest));
    if (matches.length > 0) byInterest.set(interest, matches);
  }

  const picked = new Set<string>();
  const result: RagResult[] = [];

  // First pass: take 1 from each interest bucket.
  const bucketLists = Array.from(byInterest.values());
  for (const matches of bucketLists) {
    for (const r of matches) {
      if (!picked.has(r.venue.id)) {
        picked.add(r.venue.id);
        result.push(r);
        break;
      }
    }
    if (result.length >= topK) return result;
  }

  // Second pass: fill remaining slots by raw score order.
  for (const r of scored) {
    if (result.length >= topK) break;
    if (!picked.has(r.venue.id)) {
      picked.add(r.venue.id);
      result.push(r);
    }
  }

  return result;
}

// ---- Helpers ----

/**
 * Score the overlap between a user's set and a venue's set. Range [0, 1].
 * Not strict Jaccard (|A∩B|/|A∪B|) — we use |A∩B|/|A| so a venue that fully
 * matches the user's interests scores 1.0 even if it has extra tags.
 */
function jaccardLike(userTags: string[], venueTags: string[]): number {
  if (userTags.length === 0) return 0;
  const venueSet = new Set(venueTags);
  let hits = 0;
  for (const t of userTags) if (venueSet.has(t)) hits++;
  return hits / userTags.length;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeDietaryTags(tags: string[]): string[] {
  return tags
    .map((tag) => DIETARY_ALIASES[tag] ?? tag)
    .filter((tag) => !NON_VENUE_DIETARY.has(tag));
}

function getISTMinutesSinceMidnight(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

/**
 * Whether a venue is open at the start of a plan window with enough time for
 * one stop. Uses IST — server timezone must not affect Bangalore planning.
 */
function isOpenForPlanWindow(
  openingHours: string | null,
  windowStart: Date,
  minDurationMinutes: number
): boolean {
  if (!openingHours) return true;

  const blocks = openingHours.split(",").map((b) => b.trim());
  const startMin = getISTMinutesSinceMidnight(windowStart);

  for (const block of blocks) {
    const m = block.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
    if (!m) continue;

    const openMin = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    let closeMin = parseInt(m[3], 10) * 60 + parseInt(m[4], 10);
    if (closeMin <= openMin) closeMin += 24 * 60;

    let checkStart = startMin;
    if (checkStart < openMin && closeMin > 24 * 60) {
      checkStart += 24 * 60;
    }

    if (checkStart >= openMin && checkStart < closeMin) {
      const remaining = closeMin - checkStart;
      if (remaining >= minDurationMinutes) return true;
    }
  }

  return false;
}
