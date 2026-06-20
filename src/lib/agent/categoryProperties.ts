// Agent layer — category properties.
//
// Stage 2's PlanStop has `category` but no explicit indoor/outdoor field.
// Rather than mutate PlanStop (which would force a Stage 2 migration), the
// agent uses category as the proxy for indoor/outdoor at classification time.
//
// This is the single place that knows the mapping. If a new category is
// added in src/lib/constants/venues.ts (migration 010+), this file must
// add a corresponding entry — there's a default-to-indoor fallback below
// so adding a category won't crash the agent, but it would mean weather/AQI
// disruptions wouldn't fire on the new category until the mapping is added.

import type { VenueCategoryId } from "@/lib/constants/venues";

/**
 * Outdoor categories: ones where rain or AQI spike makes the stop unviable.
 *
 *   park  — definitionally outdoor
 *   walk  — definitionally outdoor
 *
 * Everything else is indoor (cafe, restaurant, art, wellness, bookstore,
 * bar, entertainment). Wellness covers things like spa/yoga studios — all
 * indoor in our 79-venue dataset. If we add outdoor yoga later, this
 * mapping needs to know about it.
 */
const OUTDOOR_CATEGORIES = new Set<VenueCategoryId>(["park", "walk"]);

export function isOutdoor(category: string): boolean {
  return OUTDOOR_CATEGORIES.has(category as VenueCategoryId);
}

export function isIndoor(category: string): boolean {
  return !isOutdoor(category);
}
