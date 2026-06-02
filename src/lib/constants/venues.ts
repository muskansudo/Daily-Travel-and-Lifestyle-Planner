// Venue tag vocabulary
// Mirrors src/lib/constants/wardrobe.ts pattern: closed vocabularies so LLM output
// downstream can be sanitised against these lists. RAG retrieval also uses these
// when scoring candidate venues against user inputs.

export const VENUE_CATEGORIES = [
  { id: "cafe", label: "Cafe" },
  { id: "restaurant", label: "Restaurant" },
  { id: "park", label: "Park" },
  { id: "walk", label: "Walk" },
  { id: "art", label: "Art" },
  { id: "wellness", label: "Wellness" },
  { id: "bookstore", label: "Bookstore" },
  { id: "bar", label: "Bar" },
  // Added in migration 009: classic "friend activity" category — movies,
  // bowling, escape rooms, gaming. Used as the friend-default fallback when
  // two friends have zero shared interest overlap.
  { id: "entertainment", label: "Entertainment" },
] as const;

export const VENUE_NEIGHBORHOODS = [
  { id: "bagmane_orr", label: "Bagmane / ORR" },
  { id: "indiranagar", label: "Indiranagar" },
  { id: "koramangala", label: "Koramangala" },
  { id: "whitefield", label: "Whitefield" },
  { id: "mg_road_brigade", label: "MG Road / Brigade" },
] as const;

// Aligned with wardrobe dietary vocabulary so a user's wardrobe-time dietary flag
// can join against venues without translation. (no_restrictions is the catch-all.)
export const VENUE_DIETARY = [
  "vegan",
  "vegetarian",
  "jain_friendly",
  "halal",
  "gluten_free",
  "no_restrictions",
] as const;

// Vibe tags are the bridge between L1 (vision LLM mood) and L2 (RAG retrieval).
// Mood JSON returned from a photo will pick from this list; venues are tagged
// against the same list. No vector embeddings needed — set overlap is the join.
export const VENUE_VIBES = [
  "chill",
  "productive",
  "social",
  "quiet",
  "lively",
  "romantic",
  "adventurous",
  "contemplative",
] as const;

// Aligned with onboarding interests on the user. Direct join: user.interest_tags
// intersected with venue.interest_tags drives the retrieval ranking.
export const VENUE_INTERESTS = [
  "cafe_hopping",
  "walks",
  "photography",
  "art",
  "museum",
  "music",
  "night_out",
  "workout",
  "parks",
  "fashion",
] as const;

export type VenueCategoryId = (typeof VENUE_CATEGORIES)[number]["id"];
export type VenueNeighborhoodId = (typeof VENUE_NEIGHBORHOODS)[number]["id"];
export type VenueDietaryId = (typeof VENUE_DIETARY)[number];
export type VenueVibeId = (typeof VENUE_VIBES)[number];
export type VenueInterestId = (typeof VENUE_INTERESTS)[number];

// Reference coordinates used for distance bias when the caller doesn't supply
// the user's current location (e.g. plan generation from cold start).
// Bagmane Tech Park ~ TI India campus.
export const DEFAULT_BIAS_LATLNG = { lat: 12.9876, lng: 77.6926 } as const;

// ---- Time-of-day vocabulary ----
//
// Closed set of buckets a venue can be tagged as fitting (column
// venues.time_of_day_fit in Supabase). Per-slot retrieval uses this as a HARD
// FILTER: a 20:00 dinner slot never sees a venue tagged morning-only.
//
// Boundaries (IST):
//   morning   06:00 - 11:00
//   midday    11:00 - 15:00  (lunch zone)
//   afternoon 15:00 - 18:00
//   evening   18:00 - 21:00  (dinner zone)
//   night     21:00 - 23:00
//
// Anything before 06:00 or after 23:00 falls back to the closest bucket — the
// planner shouldn't be scheduling stops in those hours anyway.

export const TIME_OF_DAY_BUCKETS = [
  "morning",
  "midday",
  "afternoon",
  "evening",
  "night",
] as const;

export type TimeOfDayBucket = (typeof TIME_OF_DAY_BUCKETS)[number];

/**
 * Map a slot start time to its time-of-day bucket. Uses IST hours regardless
 * of where the server runs (Vercel is UTC, we plan in IST).
 */
export function bucketForHour(date: Date): TimeOfDayBucket {
  const hourStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    hour12: false,
  }).format(date);
  const hour = Number(hourStr.slice(0, 2));

  if (hour < 11) return "morning";
  if (hour < 15) return "midday";
  if (hour < 18) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

/**
 * Buckets that bracket the given bucket — used by the fallback chain (design
 * doc section 10, step 3) when a slot's primary bucket returns zero candidates.
 * An evening slot widens to afternoon + evening + night before giving up.
 */
export function widenBucket(b: TimeOfDayBucket): TimeOfDayBucket[] {
  switch (b) {
    case "morning":
      return ["morning", "midday"];
    case "midday":
      return ["morning", "midday", "afternoon"];
    case "afternoon":
      return ["midday", "afternoon", "evening"];
    case "evening":
      return ["afternoon", "evening", "night"];
    case "night":
      return ["evening", "night"];
  }
}

// ---- Category-interest locks ----
//
// Category diversity (one stop per category per day) is the default rule. But
// if the user explicitly listed an interest that maps to a single category,
// that category becomes EXEMPT from the diversity exclusion. A user who picked
// "cafe_hopping" can and should see multiple cafes in their day.
//
// Implementation: when retrieving for slot N, the orchestrator passes the
// already-used categories as exclusions UNLESS the user's interests intersect
// with this map's keys, in which case the mapped category is permitted to
// repeat.

export const CATEGORY_INTEREST_LOCKS: Record<string, VenueCategoryId> = {
  cafe_hopping: "cafe",
  night_out: "bar",
  art: "art",
  parks: "park",
};

/**
 * Given the user's interest tags, return the set of category ids that may
 * repeat across the day's plan. All other categories are subject to the
 * one-per-day diversity rule.
 */
export function repeatableCategories(
  userInterests: readonly string[]
): Set<VenueCategoryId> {
  const allowed = new Set<VenueCategoryId>();
  for (const interest of userInterests) {
    const cat = CATEGORY_INTEREST_LOCKS[interest];
    if (cat) allowed.add(cat);
  }
  return allowed;
}
