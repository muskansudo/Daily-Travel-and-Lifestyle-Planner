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
