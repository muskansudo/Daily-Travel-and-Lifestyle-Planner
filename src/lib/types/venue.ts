// Venue types — mirrors src/lib/types/wardrobe.ts pattern: snake_case DB row,
// camelCase DTO for the client, a conversion helper, and the typed inputs/outputs
// that the retrieval layer (src/lib/ai/rag.ts) consumes and returns.

export interface Venue {
  id: string;
  name: string;
  category: string;
  neighborhood: string;
  lat: number;
  lng: number;
  dietary_tags: string[];
  vibe_tags: string[];
  interest_tags: string[];
  price_tier: number;
  opening_hours: string | null;
  why_this_short: string;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface VenueDTO {
  id: string;
  name: string;
  category: string;
  neighborhood: string;
  lat: number;
  lng: number;
  dietaryTags: string[];
  vibeTags: string[];
  interestTags: string[];
  priceTier: number;
  openingHours: string | null;
  whyThisShort: string;
  imageUrl: string | null;
}

export function toVenueDTO(row: Venue): VenueDTO {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    neighborhood: row.neighborhood,
    lat: Number(row.lat),
    lng: Number(row.lng),
    dietaryTags: row.dietary_tags,
    vibeTags: row.vibe_tags,
    interestTags: row.interest_tags,
    priceTier: row.price_tier,
    openingHours: row.opening_hours,
    whyThisShort: row.why_this_short,
    imageUrl: row.image_url,
  };
}

// Inputs into the retrieval layer. Optional fields let callers omit signals they
// don't have yet (e.g. mood may be null when the user hasn't uploaded a vibe image).
export interface RagInputs {
  // From the user profile (onboarding preferences)
  dietaryTags: string[];          // user's hard dietary constraints — used as filter
  interestTags: string[];         // user's interests — used as soft scoring signal
  // From the vibe image L1 output (optional)
  moodVibes?: string[];           // 1-3 vibes extracted from photo; used as soft scoring
  // From the calendar / time window
  windowStart?: Date;             // start of the free slot the planner is filling
  windowEnd?: Date;               // end of the free slot
  // From the user's location (or a known anchor like a calendar meeting)
  biasLat?: number;
  biasLng?: number;
  // Filters the caller can tighten
  allowedCategories?: string[];   // e.g. only ['cafe','park'] for a 30-min coffee break
  allowedNeighborhoods?: string[];
  // How many candidates to return (default 8 — enough for L3 LLM to build a varied plan)
  topK?: number;
}

// A scored retrieval result. `score` is exposed so callers can inspect rankings
// during demo rehearsal and so prompts can include score as a confidence hint.
export interface RagResult {
  venue: VenueDTO;
  score: number;
  // Per-signal breakdown so the demo can show "why this scored 0.82":
  // useful in the "Why this" reasoning surfaced to the user.
  breakdown: {
    dietary: boolean;     // passed hard filter
    interest: number;     // 0..1 — fraction of user interests matched
    vibe: number;         // 0..1 — fraction of mood vibes matched (0 if no mood)
    distance: number;     // 0..1 — closer = higher (haversine, soft)
    openNow: boolean;     // open during the requested window
  };
}
