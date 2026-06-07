"use client";

import {
  formatPlanningOpensAt,
  getPlanningOpensAt,
} from "@/lib/planning/quietHours";

export function PlanningQuietHoursNotice({
  variant = "card",
}: {
  variant?: "card" | "inline";
}) {
  const opensAt = formatPlanningOpensAt(getPlanningOpensAt());

  if (variant === "inline") {
    return (
      <div className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-3">
        <p className="font-montserrat text-xs leading-relaxed text-on-surface-variant">
          Generate at {opensAt} to fill the gaps around your schedule.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/40 bg-white/20 px-5 py-4 text-center">
      <p className="font-playfair text-lg text-on-surface">The city&apos;s resting</p>
      <p className="mt-2 font-montserrat text-sm leading-relaxed text-on-surface-variant">
        Planning opens at {opensAt} IST. Check back then to plan your day.
      </p>
    </div>
  );
}
