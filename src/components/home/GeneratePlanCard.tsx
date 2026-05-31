"use client";

import { motion } from "framer-motion";
import { fadeUp } from "./animations";

export function GeneratePlanCard({
  onGenerate,
  onManualSchedule,
  disabled,
  manualEntryCount = 0,
}: {
  onGenerate: () => void;
  onManualSchedule: () => void;
  disabled?: boolean;
  manualEntryCount?: number;
}) {
  return (
    <motion.section
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      className="relative"
    >
      <div className="glass-panel silk-border overflow-hidden rounded-2xl p-6">
        <div className="relative mb-6">
          <div
            className="pointer-events-none absolute -inset-8 -z-10 opacity-30 blur-[50px]"
            style={{
              background:
                "radial-gradient(circle, rgba(196, 158, 236, 0.4) 0%, transparent 70%)",
            }}
            aria-hidden
          />
          <span className="mb-2 block font-montserrat text-xs font-semibold uppercase tracking-widest text-tertiary">
            AI Daily Planner
          </span>
          <h2 className="font-playfair text-2xl font-semibold text-on-surface sm:text-3xl">
            Your day, curated
          </h2>
          <p className="mt-2 font-montserrat text-sm leading-relaxed text-on-surface-variant">
            Saanjh reads your calendar, weather, wardrobe, and vibe to craft a
            seamless day plan.
          </p>
          {manualEntryCount > 0 && (
            <p className="mt-2 font-montserrat text-xs font-semibold text-primary">
              {manualEntryCount} manual{" "}
              {manualEntryCount === 1 ? "commitment" : "commitments"} saved
            </p>
          )}
        </div>

        <div className="space-y-3">
          <motion.button
            type="button"
            disabled={disabled}
            onClick={onGenerate}
            whileHover={disabled ? undefined : { scale: 1.01, y: -2 }}
            whileTap={disabled ? undefined : { scale: 0.98 }}
            className="btn-premium flex w-full items-center justify-center gap-2 rounded-full py-4 font-montserrat text-sm font-semibold uppercase tracking-wider disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[20px]">
              auto_awesome
            </span>
            Generate My Day
          </motion.button>

          <motion.button
            type="button"
            onClick={onManualSchedule}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-white/60 bg-white/30 py-3.5 font-montserrat text-sm font-semibold uppercase tracking-wider text-primary backdrop-blur-md transition-colors hover:bg-white/50"
          >
            <span className="material-symbols-outlined text-[18px]">edit</span>
            Enter Schedule Manually
          </motion.button>
        </div>
      </div>
    </motion.section>
  );
}
