import type { EnergyAlignmentTier } from "@/lib/types/friends";

/**
 * Energy alignment uses interest_tags only (Jaccard similarity → 0–100%).
 */
export function computeEnergyAlignmentPercent(
  myInterestTags: string[],
  theirInterestTags: string[]
): number {
  if (myInterestTags.length === 0 && theirInterestTags.length === 0) return 0;

  const theirs = new Set(theirInterestTags);
  const intersection = myInterestTags.filter((tag) => theirs.has(tag)).length;
  const union = new Set([...myInterestTags, ...theirInterestTags]).size;
  if (union === 0) return 0;

  return Math.round((intersection / union) * 100);
}

export function energyAlignmentTier(
  percent: number
): EnergyAlignmentTier {
  if (percent === 0) return "none";
  if (percent >= 80) return "high";
  if (percent >= 50) return "good";
  return "building";
}

export function intersectTags(a: string[], b: string[]): string[] {
  const setB = new Set(b);
  return a.filter((tag) => setB.has(tag));
}

export function unionTags(a: string[], b: string[]): string[] {
  const merged = a.slice();
  for (const tag of b) {
    if (!merged.includes(tag)) merged.push(tag);
  }
  return merged;
}

/** Shared interests for RAG; union fallback when none overlap. */
export function collabInterestTags(a: string[], b: string[]): string[] {
  const shared = intersectTags(a, b);
  return shared.length > 0 ? shared : unionTags(a, b);
}

/** Venue hard filter must satisfy both users' dietary needs. */
export function collabDietaryTags(a: string[], b: string[]): string[] {
  return unionTags(a, b);
}

// ---- Friend-default category fallback ----
//
// When two friends have ZERO shared interests the interest-based retrieval
// signal disappears. Rather than unioning both users' full interest sets
// (which picks individual activities, not friend activities) we fall back to
// categories that are inherently social: eating, drinking, and entertainment.
//
// Rationale for the list:
//   - restaurant / bar / cafe: universal "meet and eat/drink" social formats.
//   - entertainment: movies, bowling, escape rooms, arcades — exactly what
//     friends default to when they have nothing specific in common.
// Art and park are intentionally excluded from the hard fallback — they skew
// solo in our corpus (galleries are quiet, park walks feel solo-leaning).
//
// When friends DO share interests, no category filter is applied — the shared
// interests drive retrieval naturally (same as Home tab behaviour).

export const FRIEND_DEFAULT_CATEGORIES = [
  "entertainment",
  "restaurant",
  "bar",
  "cafe",
] as const;

/**
 * Returns the allowed category list for collab RAG retrieval.
 *
 * - If the two friends share ≥1 interest tag: returns undefined (no category
 *   filter — shared interests drive retrieval, same as Home tab).
 * - If they share ZERO interests: returns FRIEND_DEFAULT_CATEGORIES so
 *   retrieval is hard-filtered to inherently social venues.
 *
 * Pass the return value directly as `allowedCategories` in the retrieveVenues
 * call. Returning undefined means "no filter" in rag.ts — don't change that.
 */
export function collabAllowedCategories(
  meInterests: string[],
  friendInterests: string[]
): string[] | undefined {
  const shared = intersectTags(meInterests, friendInterests);
  if (shared.length > 0) return undefined; // interests do the work
  return [...FRIEND_DEFAULT_CATEGORIES];
}
