"use client";

import type { FriendSummary } from "@/lib/types/friends";
import { friendHasNoSchedule } from "@/lib/friends/friendSchedule";
import { cn } from "@/lib/utils/cn";
import { EnergyAlignmentBadge } from "./EnergyAlignmentBadge";
import { FriendAvatar } from "./FriendAvatar";
import { FriendTagPills } from "./FriendTagPills";

export function FriendCard({
  friend,
  onLetsPlan,
  onViewSharedPlans,
  onExpenses,
  onRemove,
  removing,
}: {
  friend: FriendSummary;
  onLetsPlan: (friend: FriendSummary) => void;
  onViewSharedPlans: (friend: FriendSummary) => void;
  onExpenses: (friend: FriendSummary) => void;
  onRemove: (friend: FriendSummary) => void;
  removing?: boolean;
}) {
  const name = friend.displayName?.trim() || "Friend";
  const scheduleBlocked = friendHasNoSchedule(friend);

  return (
    <article
      className={cn(
        "glass-panel silk-border relative flex flex-col gap-4 overflow-hidden rounded-2xl p-4 shadow-[0_4px_24px_rgba(139,78,60,0.03)]",
        scheduleBlocked && "border-dashed border-primary/20 opacity-95",
        removing && "pointer-events-none opacity-60"
      )}
    >
      <button
        type="button"
        disabled={removing}
        onClick={() => onRemove(friend)}
        className="absolute right-2 top-1 z-20 rounded-full p-1 text-on-surface-variant/45 transition-colors hover:bg-white/50 hover:text-error"
        aria-label={`Remove ${name} from friends`}
      >
        <span className="material-symbols-outlined text-[17px]">delete</span>
      </button>

      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            "radial-gradient(circle, rgba(232, 155, 134, 0.12) 0%, rgba(196, 158, 236, 0.08) 50%, transparent 70%)",
        }}
        aria-hidden
      />

      <div className="flex items-start justify-between gap-3 pr-1">
        <div className="flex min-w-0 items-center gap-4">
          <FriendAvatar
            displayName={friend.displayName}
            profilePhotoUrl={friend.profilePhotoUrl}
            grayscale={scheduleBlocked}
          />
          <div className="min-w-0">
            <h3 className="truncate font-playfair text-[22px] font-semibold text-on-surface">
              {name}
            </h3>
            {scheduleBlocked && (
              <p className="font-montserrat text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/50">
                No schedule shared
              </p>
            )}
          </div>
        </div>
        {!scheduleBlocked && (
          <div className="shrink-0 pt-7">
            <EnergyAlignmentBadge
              percent={friend.energyAlignmentPercent}
              tier={friend.energyAlignmentTier}
            />
          </div>
        )}
      </div>

      {!scheduleBlocked && (
        <FriendTagPills
          interestTags={friend.interestTags}
          lifestyleTags={friend.lifestyleTags}
          dietaryTags={friend.dietaryTags}
        />
      )}

      <div className="flex flex-col items-center gap-2 pt-1">
        <button
          type="button"
          disabled={scheduleBlocked || removing}
          onClick={() => onLetsPlan(friend)}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-full py-3.5 font-montserrat text-[13px] font-bold uppercase tracking-[0.2em]",
            scheduleBlocked
              ? "cursor-not-allowed border border-outline-variant/40 bg-outline-variant/25 text-on-surface-variant/45"
              : "btn-premium"
          )}
        >
          Let&apos;s Plan
          <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
        </button>
        <div className="flex w-full items-center justify-between px-2">
          <button
            type="button"
            disabled={scheduleBlocked || removing}
            onClick={() => onViewSharedPlans(friend)}
            className={cn(
              "py-1 font-montserrat text-[10px] font-semibold uppercase tracking-[0.25em]",
              scheduleBlocked
                ? "cursor-not-allowed text-on-surface-variant/35"
                : "text-primary transition-colors hover:text-primary/80"
            )}
          >
            View shared plans
          </button>
          <button
            type="button"
            disabled={scheduleBlocked || removing}
            onClick={() => onExpenses(friend)}
            className={cn(
              "flex items-center gap-1 py-1 font-montserrat text-[10px] font-semibold uppercase tracking-[0.25em]",
              scheduleBlocked
                ? "cursor-not-allowed text-on-surface-variant/35"
                : "text-primary transition-colors hover:text-primary/80"
            )}
          >
            <span className="material-symbols-outlined text-[14px]">
              account_balance_wallet
            </span>
            Expenses
          </button>
        </div>
      </div>
    </article>
  );
}
