import { energyAlignmentTierLabel } from "@/lib/friends/alignmentLabels";
import type { EnergyAlignmentTier } from "@/lib/types/friends";
import { cn } from "@/lib/utils/cn";

export function EnergyAlignmentBadge({
  percent,
  tier,
  className,
}: {
  percent: number;
  tier: EnergyAlignmentTier;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-end", className)}>
      <span className="font-montserrat text-[9px] font-semibold uppercase tracking-wider text-primary">
        {energyAlignmentTierLabel(tier)}
      </span>
      <span className="font-montserrat text-[10px] font-medium text-on-surface-variant">
        {percent}% Energy Match
      </span>
    </div>
  );
}
