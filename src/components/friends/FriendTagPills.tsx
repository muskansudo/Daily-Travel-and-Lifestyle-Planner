import { tagIdsToLabels } from "@/lib/friends/tagLabels";
import { cn } from "@/lib/utils/cn";

const MAX_VISIBLE = 8;

export function FriendTagPills({
  interestTags,
  lifestyleTags,
  dietaryTags,
  className,
}: {
  interestTags: string[];
  lifestyleTags: string[];
  dietaryTags: string[];
  className?: string;
}) {
  const allIds = [...interestTags, ...lifestyleTags, ...dietaryTags];
  const labels = tagIdsToLabels(allIds).slice(0, MAX_VISIBLE);
  const overflow = allIds.length - labels.length;

  if (labels.length === 0) {
    return (
      <p className="font-montserrat text-[11px] italic text-on-surface-variant/60">
        No preferences shared yet
      </p>
    );
  }

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {labels.map((label, index) => (
        <span
          key={`${label}-${index}`}
          className="rounded-full bg-white/40 px-2.5 py-0.5 font-montserrat text-[11px] font-medium tracking-wide text-on-surface/90"
        >
          {label}
        </span>
      ))}
      {overflow > 0 && (
        <span className="rounded-full bg-white/30 px-2.5 py-0.5 font-montserrat text-[11px] text-on-surface-variant/70">
          +{overflow}
        </span>
      )}
    </div>
  );
}
