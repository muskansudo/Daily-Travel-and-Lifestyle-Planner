"use client";

// PreGenerationSheet
//
// A two-question bottom sheet shown before plan generation fires. Captures
// two real-time context signals that personalise the plan to how the user
// is TODAY, not just who they are in their static onboarding profile.
//
//   Q1 — Energy: maps to vibe tags appended to the generation request.
//        Recharging → chill, quiet, contemplative
//        Balanced   → (neutral, no extra tags)
//        Let's go   → social, lively, adventurous
//
//   Q2 — Budget: captured and surfaced. Mapped to a vibe lean for the demo
//        (light → quiet/chill leaning toward lower-key venues). True price
//        filtering requires a venue price column (L4). The selection is
//        passed through so the finance layer and future price filter can
//        consume it.
//
// The energy/budget → vibe-tag mapping means these signals flow into the
// EXISTING L2 retrieval path (moodVibes) with zero backend changes. That's
// the honest, shippable version for the demo.
//
// Usage: parent opens this sheet when "Generate My Day" is tapped. On
// confirm, it calls onConfirm(vibeTags, energy, budget) and the parent runs
// generation with those tags merged into selectedVibes.

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export type EnergyLevel = "recharging" | "balanced" | "lets_go";
export type BudgetLevel = "light" | "comfortable" | "open";

interface PreGenerationSheetProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (
    vibeTags: string[],
    energy: EnergyLevel,
    budget: BudgetLevel
  ) => void;
}

const ENERGY_OPTIONS: {
  value: EnergyLevel;
  label: string;
  sublabel: string;
  icon: string;
  vibeTags: string[];
}[] = [
  {
    value: "recharging",
    label: "Recharging",
    sublabel: "Low-key, quiet, restorative",
    icon: "battery_low",
    vibeTags: ["chill", "quiet", "contemplative"],
  },
  {
    value: "balanced",
    label: "Balanced",
    sublabel: "A bit of everything",
    icon: "battery_horiz_050",
    vibeTags: [],
  },
  {
    value: "lets_go",
    label: "Let's go",
    sublabel: "Social, lively, out and about",
    icon: "battery_full",
    vibeTags: ["social", "lively", "adventurous"],
  },
];

const BUDGET_OPTIONS: {
  value: BudgetLevel;
  label: string;
  sublabel: string;
  icon: string;
}[] = [
  {
    value: "light",
    label: "Light",
    sublabel: "Under ₹500",
    icon: "savings",
  },
  {
    value: "comfortable",
    label: "Comfortable",
    sublabel: "₹500 – 1500",
    icon: "account_balance_wallet",
  },
  {
    value: "open",
    label: "Open",
    sublabel: "₹1500+",
    icon: "diamond",
  },
];

export function PreGenerationSheet({
  open,
  onClose,
  onConfirm,
}: PreGenerationSheetProps) {
  const [energy, setEnergy] = useState<EnergyLevel | null>(null);
  const [budget, setBudget] = useState<BudgetLevel | null>(null);

  const canConfirm = energy !== null && budget !== null;

  const handleConfirm = () => {
    if (!energy || !budget) return;
    const energyOption = ENERGY_OPTIONS.find((o) => o.value === energy)!;
    // Budget light leans the plan a touch calmer; open leans social.
    const budgetTags =
      budget === "light" ? ["chill"] : budget === "open" ? ["social"] : [];
    const vibeTags = Array.from(
      new Set([...energyOption.vibeTags, ...budgetTags])
    );
    onConfirm(vibeTags, energy, budget);
    // Reset for next open.
    setEnergy(null);
    setBudget(null);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="pregen-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            key="pregen-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed bottom-0 left-0 right-0 z-50 max-h-[88vh] overflow-y-auto rounded-t-3xl bg-surface shadow-2xl"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="h-1 w-10 rounded-full bg-outline-variant" />
            </div>

            <div className="px-6 pb-8 pt-2">
              <p className="font-montserrat text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                Before we plan
              </p>
              <h2 className="font-playfair text-2xl text-on-surface mt-1">
                Two quick things
              </h2>

              {/* Q1 — Energy */}
              <div className="mt-6">
                <p className="font-montserrat text-sm font-semibold text-on-surface mb-3">
                  How&apos;s your energy today?
                </p>
                <div className="grid grid-cols-3 gap-2.5">
                  {ENERGY_OPTIONS.map((opt) => {
                    const selected = energy === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setEnergy(opt.value)}
                        className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 p-3 text-center transition-all ${
                          selected
                            ? "border-primary bg-primary/5"
                            : "border-outline-variant bg-surface-container-low hover:border-outline"
                        }`}
                      >
                        <span
                          className={`material-symbols-outlined text-[26px] ${
                            selected ? "text-primary" : "text-on-surface-variant"
                          }`}
                        >
                          {opt.icon}
                        </span>
                        <span
                          className={`font-montserrat text-xs font-semibold ${
                            selected ? "text-primary" : "text-on-surface"
                          }`}
                        >
                          {opt.label}
                        </span>
                        <span className="font-montserrat text-[9px] leading-tight text-on-surface-variant">
                          {opt.sublabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Q2 — Budget */}
              <div className="mt-6">
                <p className="font-montserrat text-sm font-semibold text-on-surface mb-3">
                  What&apos;s your budget today?
                </p>
                <div className="grid grid-cols-3 gap-2.5">
                  {BUDGET_OPTIONS.map((opt) => {
                    const selected = budget === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setBudget(opt.value)}
                        className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 p-3 text-center transition-all ${
                          selected
                            ? "border-tertiary bg-tertiary/5"
                            : "border-outline-variant bg-surface-container-low hover:border-outline"
                        }`}
                      >
                        <span
                          className={`material-symbols-outlined text-[26px] ${
                            selected
                              ? "text-tertiary"
                              : "text-on-surface-variant"
                          }`}
                        >
                          {opt.icon}
                        </span>
                        <span
                          className={`font-montserrat text-xs font-semibold ${
                            selected ? "text-tertiary" : "text-on-surface"
                          }`}
                        >
                          {opt.label}
                        </span>
                        <span className="font-montserrat text-[9px] leading-tight text-on-surface-variant">
                          {opt.sublabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Confirm */}
              <button
                type="button"
                disabled={!canConfirm}
                onClick={handleConfirm}
                className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-4 font-montserrat text-sm font-semibold uppercase tracking-wider text-on-primary transition-opacity disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[18px]">
                  auto_awesome
                </span>
                Generate my day
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
