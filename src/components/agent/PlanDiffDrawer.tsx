"use client";

// PlanDiffDrawer
//
// Shows before/after comparison of the plan after a repair. Opens when the
// reasoning trace stream completes. Gives the user Accept (commits the
// repaired plan to localStorage) or Reject (discards, keeps original).
//
// Border colors per stop state:
//   green  (#4CAF50 / green-600) — unchanged stop
//   red    (error)               — removed venue
//   blue   (tertiary)            — new venue replacing the old one
//   yellow (amber-500)           — in_progress_alert (you're there now)
//   orange (orange-500)          — time_window / travel_time / outfit change
//
// The Accept button also stamps the current episodeId so the same stop
// can't be re-flagged for the same disruption episode (Issue 1 fix).

import { AnimatePresence, motion } from "framer-motion";
import type { Change, RepairResult } from "@/lib/agent/types";
import type { PlanGenerateResponse } from "@/lib/home/generatePlan";
import type { PlanStop } from "@/lib/ai/plan";

interface PlanDiffDrawerProps {
  open: boolean;
  originalPlan: PlanGenerateResponse | null;
  repairedPlan: PlanGenerateResponse | null;
  result: RepairResult | null;
  onAccept: () => void;
  onReject: () => void;
}

function flatStops(plan: PlanGenerateResponse): PlanStop[] {
  return plan.windows.flatMap((w) => w.plan.stops);
}

function changeForStop(
  index: number,
  changes: Change[]
): Change | undefined {
  return changes.find(
    (c) => c.stopIndex === index && c.field === "venue"
  );
}

function alertForStop(
  index: number,
  changes: Change[]
): Change | undefined {
  return changes.find(
    (c) => c.stopIndex === index && c.field === "alert"
  );
}

function travelChangeForStop(
  index: number,
  changes: Change[]
): Change | undefined {
  return changes.find(
    (c) => c.stopIndex === index && c.field === "travel_time"
  );
}

interface StopCardProps {
  stop: PlanStop;
  variant: "unchanged" | "removed" | "added" | "alert" | "travel";
  why?: string;
  travelMin?: number | null;
}

function StopCard({ stop, variant, why, travelMin }: StopCardProps) {
  const borderClass = {
    unchanged: "border-green-500",
    removed: "border-error opacity-60",
    added: "border-tertiary",
    alert: "border-amber-500",
    travel: "border-orange-400",
  }[variant];

  const badge =
    variant === "added" ? (
      <span className="rounded-full bg-tertiary px-2 py-0.5 font-montserrat text-[9px] font-semibold uppercase tracking-wider text-on-primary">
        NEW
      </span>
    ) : variant === "alert" ? (
      <span className="rounded-full bg-amber-500 px-2 py-0.5 font-montserrat text-[9px] font-semibold uppercase tracking-wider text-white">
        HERE NOW
      </span>
    ) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border-2 ${borderClass} bg-surface-container-low p-3 space-y-1`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p
            className={`font-playfair text-sm text-on-surface leading-snug ${
              variant === "removed" ? "line-through" : ""
            }`}
          >
            {stop.venueName}
          </p>
          <p className="font-montserrat text-[10px] text-on-surface-variant mt-0.5">
            {stop.startTime} – {stop.endTime} · {stop.category}
          </p>
        </div>
        {badge}
      </div>

      {travelMin !== null && travelMin !== undefined && (
        <p className="font-montserrat text-[10px] text-orange-600">
          ~{travelMin} min travel
        </p>
      )}

      {why && variant !== "unchanged" && (
        <p className="font-montserrat text-[10px] text-on-surface-variant italic border-t border-outline-variant pt-1 mt-1">
          {why}
        </p>
      )}
    </motion.div>
  );
}

export function PlanDiffDrawer({
  open,
  originalPlan,
  repairedPlan,
  result,
  onAccept,
  onReject,
}: PlanDiffDrawerProps) {
  if (!originalPlan || !repairedPlan || !result) return null;

  const origStops = flatStops(originalPlan);
  const repStops = flatStops(repairedPlan);
  const changes = result.changes;

  const hasChanges = changes.length > 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="diff-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
            onClick={onReject}
          />

          {/* Bottom sheet */}
          <motion.div
            key="diff-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] rounded-t-3xl bg-surface shadow-2xl flex flex-col"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="h-1 w-10 rounded-full bg-outline-variant" />
            </div>

            {/* Header */}
            <div className="px-5 pb-3 border-b border-outline-variant">
              <p className="font-montserrat text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                Surgical repair
              </p>
              <h3 className="font-playfair text-lg text-on-surface mt-0.5">
                {hasChanges
                  ? `${changes.length} change${changes.length > 1 ? "s" : ""} — ${new Set(changes.map(c => c.stopIndex)).size} stop${new Set(changes.map(c => c.stopIndex)).size !== 1 ? "s" : ""} affected`
                  : "Your plan is intact"}
              </h3>
              {/* Summary headline — pulls the agent's own decision reasoning */}
              {result.reasoningTrace.filter(l => l.category === "decision").slice(0, 1).map((line, i) => (
                <p key={i} className="font-montserrat text-xs text-on-surface-variant mt-2 leading-relaxed">
                  {line.text.length > 140 ? line.text.slice(0, 140) + "..." : line.text}
                </p>
              ))}
            </div>

            {/* Diff cards */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
              {repStops.map((stop, i) => {
                const venueChange = changeForStop(i, changes);
                const alertChange = alertForStop(i, changes);
                const travelChange = travelChangeForStop(i, changes);

                if (alertChange) {
                  return (
                    <StopCard
                      key={stop.venueId + i}
                      stop={stop}
                      variant="alert"
                      why={alertChange.after as string}
                    />
                  );
                }

                if (venueChange) {
                  return (
                    <div key={stop.venueId + i} className="space-y-1.5">
                      {/* Removed (original) */}
                      <StopCard
                        stop={origStops[i]}
                        variant="removed"
                        why={venueChange.why}
                      />
                      {/* Added (replacement) */}
                      <StopCard
                        stop={stop}
                        variant="added"
                        why={venueChange.why}
                        travelMin={
                          travelChange
                            ? (travelChange.after as number)
                            : null
                        }
                      />
                    </div>
                  );
                }

                return (
                  <StopCard
                    key={stop.venueId + i}
                    stop={stop}
                    variant={travelChange ? "travel" : "unchanged"}
                    travelMin={
                      travelChange ? (travelChange.after as number) : null
                    }
                  />
                );
              })}

              {!hasChanges && (
                <div className="text-center py-6">
                  <p className="font-montserrat text-sm text-on-surface-variant">
                    No stops were affected by this disruption.
                  </p>
                </div>
              )}
            </div>

            {/* Accept / Reject */}
            <div className="px-5 py-4 border-t border-outline-variant flex gap-3">
              <button
                type="button"
                onClick={onReject}
                className="flex-1 rounded-full border border-outline py-3 font-montserrat text-xs font-semibold uppercase tracking-wider text-on-surface-variant transition-colors hover:bg-surface-container"
              >
                Keep original
              </button>
              {hasChanges && (
                <button
                  type="button"
                  onClick={onAccept}
                  className="flex-1 rounded-full bg-primary py-3 font-montserrat text-xs font-semibold uppercase tracking-wider text-on-primary transition-opacity hover:opacity-90"
                >
                  Accept repair
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
