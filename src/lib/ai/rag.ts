// L2 Retrieval — Saanjh's RAG layer
//
// Architecture: hand-tagged Bangalore venue corpus in Supabase (Postgres GIN indexes
// on tag arrays). Retrieval is two-phase:
//
//   1. HARD FILTERS (SQL): dietary constraint, allowed categories/neighborhoods,
//      and opening-hours bounded by the requested time window. Anything that
//      violates a user's stated dietary need is dropped — we don't rank-then-hope.
//
//   2. SOFT SCORING (in-process): rank remaining candidates by a weighted sum of
//      interest overlap, vibe overlap (from the L1 mood image), distance from the
//      bias point (haversine), and whether the venue is open during the window.
//
// Why not vector embeddings:
//   - Corpus is small (~80 venues) and hand-tagged. Set overlap beats cosine here.
//   - Tags are explainable: every recommendation can produce a "why this" trace.
//   - Demo is scripted; engine is real: same inputs always produce the same plan.
//
// L3 (Groq generation) consumes the top-K RagResult[] and grounds its plan output
// in these specific venues. The LLM is never asked to invent a venue.

import { createAdminClient } from "@/lib/supabase/admin";
import {
  toVenueDTO,
  type RagInputs,
  type RagResult,
  type Venue,
} from "@/lib/types/venue";
import { DEFAULT_BIAS_LATLNG } from "@/lib/constants/venues";

// Scoring weights — tuned for the Round 2 demo. Tweak here, not in callers.
// Sum to 1.0 for readability; the openNow signal is multiplicative (drops to 0
// when closed) rather than additive, so it isn't in the sum.
const WEIGHTS = {
  interest: 0.45,
  vibe: 0.35,
  distance: 0.2,
} as const;

// Earth radius for haversine, in km.
const EARTH_KM = 6371;

// Anything beyond this radius gets the worst distance score. 8km is roughly
// the diameter of the active Bangalore corpus (Bagmane to MG Road).
const MAX_DISTANCE_KM = 8;

/**
 * Public entry point. Takes user signals + optional time window, returns ranked
 * venues with per-signal breakdowns. Deterministic — same inputs → same outputs.
 */
export async function retrieveVenues(inputs: RagInputs): Promise<RagResult[]> {
  const topK = inputs.topK ?? 8;
  const supabase = createAdminClient();

  // ---- Phase 1: hard filters in SQL ----
  // We never use .limit() here. We want every venue that survives the hard
  // filters to be visible to the scoring phase. With ~80 rows this is cheap;
  // if the corpus grows we'd push more of the scoring into Postgres.
  let query = supabase.from("venues").select("*");

  if (inputs.allowedCategories && inputs.allowedCategories.length > 0) {
    query = query.in("category", inputs.allowedCategories);
  }
  if (inputs.allowedNeighborhoods && inputs.allowedNeighborhoods.length > 0) {
    query = query.in("neighborhood", inputs.allowedNeighborhoods);
  }

  // Dietary filter is the trickiest hard filter. A vegan user must NOT see a
  // venue tagged only "no_restrictions" — that's a meat-friendly place. So:
  //   - If the user has any strict diet (vegan / vegetarian / jain / halal /
  //     gluten_free), the venue must include that tag OR be "vegetarian" when
  //     the user is vegan? No — we only accept exact tag overlap. The vegan
  //     user wants real vegan options, not "we have a paneer dish."
  //   - Postgres array overlap operator: dietary_tags && ARRAY[...]
  //   - If user has no dietary restriction (or only "no_restrictions"), skip.
  const strictDiet = inputs.dietaryTags.filter(
    (t) => t !== "no_restrictions"
  );
  if (strictDiet.length > 0) {
    // .overlaps() generates the && operator on text[] columns.
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
    const vibeScore = inputs.moodVibes && inputs.moodVibes.length > 0
      ? jaccardLike(inputs.moodVibes, v.vibe_tags)
      : 0;

    const distanceKm = haversineKm(biasLat, biasLng, Number(v.lat), Number(v.lng));
    const distanceScore = Math.max(0, 1 - distanceKm / MAX_DISTANCE_KM);

    const openNow = inputs.windowStart && inputs.windowEnd
      ? isOpenDuring(v.opening_hours, inputs.windowStart, inputs.windowEnd)
      : true; // no window supplied => assume open

    // Weighted sum, then multiplied by openNow (0 or 1).
    const base =
      WEIGHTS.interest * interestScore +
      WEIGHTS.vibe * vibeScore +
      WEIGHTS.distance * distanceScore;

    const score = openNow ? base : 0;

    return {
      venue: toVenueDTO(v),
      score,
      breakdown: {
        dietary: true, // already passed hard filter
        interest: interestScore,
        vibe: vibeScore,
        distance: distanceScore,
        openNow,
      },
    };
  });

  // ---- Sort + tie-break ----
  // Primary: score descending.
  // Tie-break by venue id ascending so output is fully deterministic for demo.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.venue.id < b.venue.id ? -1 : 1;
  });

  // Drop zero-scored (closed-during-window) results so the LLM doesn't see them.
  return scored.filter((r) => r.score > 0).slice(0, topK);
}

// ---- Helpers (kept inline so the whole retrieval story reads top to bottom) ----

/**
 * Score the overlap between a user's set and a venue's set. Range [0, 1].
 * Not strict Jaccard (|A∩B|/|A∪B|) — we use |A∩B|/|A| so a venue that fully
 * matches the user's interests scores 1.0 even if it has extra tags.
 * This rewards venues that "cover" what the user wants.
 */
function jaccardLike(userTags: string[], venueTags: string[]): number {
  if (userTags.length === 0) return 0;
  const venueSet = new Set(venueTags);
  let hits = 0;
  for (const t of userTags) if (venueSet.has(t)) hits++;
  return hits / userTags.length;
}

/**
 * Haversine distance in kilometres. Standard formula, no external library.
 */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Parse a venue's opening_hours string and decide whether it's open during
 * the requested [start, end] window.
 *
 * Format we tag in the corpus:
 *   "HH:MM-HH:MM"                   single block
 *   "HH:MM-HH:MM,HH:MM-HH:MM"       split day (lunch + dinner)
 *   Cross-midnight allowed: "17:00-00:30" means open until 00:30 next day.
 *
 * The check passes if ANY of the blocks contains the entire requested window.
 * This is intentionally strict — we'd rather skip a borderline venue than
 * recommend one that closes mid-plan.
 */
function isOpenDuring(
  openingHours: string | null,
  start: Date,
  end: Date
): boolean {
  if (!openingHours) return true; // unknown hours => trust the corpus tagger
  const blocks = openingHours.split(",").map((b) => b.trim());
  const startMin = start.getHours() * 60 + start.getMinutes();
  const endMinRaw = end.getHours() * 60 + end.getMinutes();

  for (const block of blocks) {
    const m = block.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
    if (!m) continue;
    const openMin = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    let closeMin = parseInt(m[3], 10) * 60 + parseInt(m[4], 10);
    if (closeMin <= openMin) closeMin += 24 * 60; // crosses midnight

    // Adjust the end-of-window if it crosses midnight relative to start.
    const endMin = endMinRaw <= startMin ? endMinRaw + 24 * 60 : endMinRaw;

    if (openMin <= startMin && endMin <= closeMin) return true;
  }
  return false;
}
