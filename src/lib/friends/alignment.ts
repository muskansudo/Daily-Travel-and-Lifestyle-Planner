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
