"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { CompatibilityPayload } from "@/lib/types/friends";
import { backdropVariants, sheetVariants } from "@/components/home/animations";
import { PremiumButton } from "@/components/ui/PremiumButton";

function TagSection({
  icon,
  title,
  labels,
  emptyText,
}: {
  icon: string;
  title: string;
  labels: string[];
  emptyText: string;
}) {
  return (
    <div className="rounded-xl border border-white/40 bg-white/30 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span
          className="material-symbols-outlined text-primary"
          style={{ fontVariationSettings: '"FILL" 1' }}
        >
          {icon}
        </span>
        <p className="font-montserrat text-[13px] font-semibold text-on-surface">
          {title}
        </p>
      </div>
      {labels.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {labels.map((label, i) => (
            <span
              key={`${label}-${i}`}
              className="rounded-full bg-white/50 px-2.5 py-0.5 font-montserrat text-[11px] text-on-surface/90"
            >
              {label}
            </span>
          ))}
        </div>
      ) : (
        <p className="font-montserrat text-[11px] text-on-surface-variant/60">
          {emptyText}
        </p>
      )}
    </div>
  );
}

export function CompatibilitySheet({
  open,
  onClose,
  loading,
  error,
  compatibility,
  friendId,
}: {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  error: string | null;
  compatibility: CompatibilityPayload | null;
  friendId: string | null;
}) {
  const router = useRouter();
  const name = compatibility?.friendDisplayName?.trim() || "your friend";

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const initiateProposal = () => {
    if (!friendId || !compatibility) return;
    onClose();
    router.push(`/friends/${friendId}/plan`);
  };

  const windows = compatibility?.sharedFreeTimes ?? [];
  const windowCount = windows.length;

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center"
          role="dialog"
          aria-modal="true"
        >
          <motion.button
            type="button"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute inset-0 bg-black/5 backdrop-blur-sm"
            aria-label="Close"
            onClick={onClose}
          />

          <motion.div
            variants={sheetVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="glass-panel silk-border relative z-10 max-h-[min(85vh,640px)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-t-[2.5rem] rounded-b-none p-5 pb-8"
          >
            <div className="mx-auto mb-5 h-1 w-12 rounded-full bg-primary/20" />

            <h3 className="mb-4 font-playfair text-lg font-semibold text-primary sm:text-xl">
              Planning with {name}
            </h3>

            {loading && (
              <p className="py-8 text-center font-montserrat text-sm text-on-surface-variant/70">
                Reading calendars…
              </p>
            )}

            {error && !loading && (
              <p className="mb-4 text-center font-montserrat text-sm text-error">
                {error}
              </p>
            )}

            {compatibility && !loading && (
              <>
                {windowCount > 0 && (
                  <div className="mb-6 rounded-2xl border border-white/60 bg-white/40 p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="font-montserrat text-[10px] font-semibold uppercase tracking-widest text-primary">
                        Free together today
                      </span>
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 font-montserrat text-[10px] font-medium text-primary">
                        {windowCount}{" "}
                        {windowCount === 1 ? "window" : "windows"}
                      </span>
                    </div>
                    <ul className="space-y-2.5 p-0">
                      {windows.map((window) => (
                        <li
                          key={window.id}
                          className={`flex list-none items-center justify-between gap-3 rounded-xl border border-white/50 bg-white/35 px-3 py-2.5 ${
                            window.status === "past"
                              ? "opacity-55"
                              : ""
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span
                              className="material-symbols-outlined shrink-0 text-[18px] text-primary"
                              style={{ fontVariationSettings: '"FILL" 1' }}
                            >
                              schedule
                            </span>
                            <span className="truncate font-playfair text-base font-semibold text-on-surface sm:text-lg">
                              {window.rangeLabel}
                            </span>
                          </div>
                          <span className="shrink-0 text-right font-montserrat text-[11px] font-medium text-on-surface-variant/80">
                            {window.durationLabel}
                            {window.status === "past" && (
                              <span className="block text-[9px] uppercase tracking-wide text-on-surface-variant/50">
                                Earlier today
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mb-8 space-y-3">
                  <TagSection
                    icon="favorite"
                    title="Shared interests"
                    labels={compatibility.sharedInterestLabels}
                    emptyText="No shared interests yet"
                  />
                  <TagSection
                    icon="self_improvement"
                    title="Shared lifestyle"
                    labels={compatibility.sharedLifestyleLabels}
                    emptyText="No shared lifestyle tags"
                  />
                  <TagSection
                    icon="restaurant"
                    title="Shared dietary"
                    labels={compatibility.sharedDietaryLabels}
                    emptyText="No shared dietary tags"
                  />
                </div>

                <PremiumButton
                  type="button"
                  onClick={initiateProposal}
                  className="mb-2"
                >
                  Initiate Proposal
                </PremiumButton>
              </>
            )}

            {!loading && !compatibility && !error && (
              <p className="py-6 text-center font-montserrat text-sm text-on-surface-variant/60">
                Choose a friend to plan with.
              </p>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
