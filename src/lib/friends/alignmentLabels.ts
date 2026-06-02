import type { EnergyAlignmentTier } from "@/lib/types/friends";

export function energyAlignmentTierLabel(tier: EnergyAlignmentTier): string {
  switch (tier) {
    case "high":
      return "High Alignment";
    case "good":
      return "Good alignment";
    case "building":
      return "Building alignment";
    default:
      return "No alignment yet";
  }
}
