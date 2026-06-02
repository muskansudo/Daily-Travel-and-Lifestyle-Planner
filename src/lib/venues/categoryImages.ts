import {
  VENUE_CATEGORIES,
  type VenueCategoryId,
} from "@/lib/constants/venues";
import { DEFAULT_VIBE_IMAGE } from "@/lib/constants/vibes";

const VENUE_IMAGE_BASE = "/images/venues";

/**
 * Static paths for category hero images under `public/images/venues/`.
 * Add a new entry here and drop `{categoryId}.png` in that folder when extending.
 */
export const VENUE_CATEGORY_IMAGE_PATHS = {
  cafe: `${VENUE_IMAGE_BASE}/cafe.png`,
  restaurant: `${VENUE_IMAGE_BASE}/restaurant.png`,
  park: `${VENUE_IMAGE_BASE}/park.png`,
  walk: `${VENUE_IMAGE_BASE}/walk.png`,
  art: `${VENUE_IMAGE_BASE}/art.png`,
  wellness: `${VENUE_IMAGE_BASE}/wellness.png`,
  bookstore: `${VENUE_IMAGE_BASE}/bookstore.png`,
  bar: `${VENUE_IMAGE_BASE}/bar.png`,
  entertainment: `${VENUE_IMAGE_BASE}/entertainment.png`,
} as const satisfies Record<VenueCategoryId, string>;

const CATEGORY_LABEL_TO_ID = Object.fromEntries(
  VENUE_CATEGORIES.map((c) => [c.label.toLowerCase(), c.id])
) as Record<string, VenueCategoryId>;

/** Alternate spellings that may appear in legacy data or LLM output. */
const CATEGORY_ALIASES: Record<string, VenueCategoryId> = {
  walks: "walk",
};

/**
 * Resolve a raw category string (id, label, or alias) to a canonical category id.
 */
export function normalizeVenueCategory(category: string): VenueCategoryId | null {
  const trimmed = category.trim();
  if (!trimmed) return null;

  const normalized = trimmed.toLowerCase().replace(/\s+/g, "_");
  const aliased = CATEGORY_ALIASES[normalized] ?? normalized;

  if (aliased in VENUE_CATEGORY_IMAGE_PATHS) {
    return aliased as VenueCategoryId;
  }

  return CATEGORY_LABEL_TO_ID[trimmed.toLowerCase()] ?? null;
}

/** Image URL for a venue category; falls back to the default vibe image when unknown. */
export function getVenueCategoryImageUrl(category: string): string {
  const id = normalizeVenueCategory(category);
  return id ? VENUE_CATEGORY_IMAGE_PATHS[id] : DEFAULT_VIBE_IMAGE;
}
