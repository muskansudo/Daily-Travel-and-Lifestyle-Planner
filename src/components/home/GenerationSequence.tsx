"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GENERATION_STEPS } from "@/lib/constants/vibes";
import type { GenerationStepId } from "@/lib/types/home";
import { cn } from "@/lib/utils/cn";
import { fadeUp } from "./animations";

const STEP_DURATION_MS = 1400;

export function GenerationSequence({
  onComplete,
  ready = true,
}: {
  onComplete: () => void;
  ready?: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<GenerationStepId[]>([]);
  const [animationDone, setAnimationDone] = useState(false);

  useEffect(() => {
    if (activeIndex >= GENERATION_STEPS.length) {
      setAnimationDone(true);
      return;
    }

    const timer = setTimeout(() => {
      setCompletedSteps((prev) => [
        ...prev,
        GENERATION_STEPS[activeIndex].id,
      ]);
      setActiveIndex((prev) => prev + 1);
    }, STEP_DURATION_MS);

    return () => clearTimeout(timer);
  }, [activeIndex]);

  useEffect(() => {
    if (animationDone && ready) {
      const timer = setTimeout(onComplete, 600);
      return () => clearTimeout(timer);
    }
  }, [animationDone, ready, onComplete]);

  const currentStep =
    activeIndex < GENERATION_STEPS.length
      ? GENERATION_STEPS[activeIndex]
      : null;

  return (
    <motion.section
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="relative flex min-h-[420px] flex-col items-center justify-center py-12"
    >
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-50 blur-[80px]"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(196, 158, 236, 0.25) 0%, transparent 60%)",
        }}
        aria-hidden
      />

      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        className="relative mb-10 flex h-24 w-24 items-center justify-center"
      >
        <div className="absolute inset-0 rounded-full border-2 border-dashed border-primary/20" />
        <div className="absolute inset-2 rounded-full border border-tertiary/30" />
        <motion.div
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-tertiary shadow-glow"
        >
          <span className="material-symbols-outlined text-2xl text-white">
            auto_awesome
          </span>
        </motion.div>
      </motion.div>

      <h2 className="mb-2 font-playfair text-2xl font-semibold text-on-surface">
        Crafting your day
      </h2>
      <p className="mb-10 font-montserrat text-sm text-on-surface-variant">
        Saanjh is weaving everything together
      </p>

      <div className="w-full max-w-sm space-y-3">
        {GENERATION_STEPS.map((step, index) => {
          const isCompleted = completedSteps.includes(step.id);
          const isActive = currentStep?.id === step.id;
          const isPending = !isCompleted && !isActive;

          return (
            <motion.div
              key={step.id}
              layout
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.08 }}
              className={cn(
                "flex items-center gap-4 rounded-2xl px-4 py-3 transition-all duration-500",
                isActive && "glass-panel ai-shimmer silk-border scale-[1.02]",
                isCompleted && "opacity-60",
                isPending && "opacity-30"
              )}
            >
              <div
                className={cn(
                  "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-all duration-500",
                  isCompleted && "bg-primary/20",
                  isActive && "bg-primary text-on-primary shadow-lg shadow-primary/20",
                  isPending && "bg-white/20"
                )}
              >
                {isCompleted ? (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="material-symbols-outlined text-primary"
                  >
                    check
                  </motion.span>
                ) : (
                  <span
                    className={cn(
                      "material-symbols-outlined",
                      isActive ? "text-white" : "text-on-surface-variant/50"
                    )}
                  >
                    {step.icon}
                  </span>
                )}
              </div>
              <div className="flex-1">
                <AnimatePresence mode="wait">
                  {isActive && (
                    <motion.p
                      key="active"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="font-montserrat text-sm font-semibold text-on-surface"
                    >
                      {step.label}
                    </motion.p>
                  )}
                  {isCompleted && !isActive && (
                    <motion.p
                      key="done"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="font-montserrat text-sm text-on-surface-variant line-through decoration-primary/30"
                    >
                      {step.label.replace("...", "")}
                    </motion.p>
                  )}
                  {isPending && (
                    <motion.p
                      key="pending"
                      className="font-montserrat text-sm text-on-surface-variant/40"
                    >
                      {step.label}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
              {isActive && (
                <motion.div
                  className="h-1.5 w-1.5 rounded-full bg-primary"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                />
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}
