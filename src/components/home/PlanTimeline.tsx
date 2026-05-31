"use client";

import { motion } from "framer-motion";
import type { TimelineItem } from "@/lib/types/home";
import { formatTime12h } from "@/lib/home/generatePlan";
import { cn } from "@/lib/utils/cn";
import { staggerContainer, staggerItem } from "./animations";

const accentStyles = {
  primary: {
    dot: "border-primary-container",
    time: "text-primary",
    icon: "text-primary/60",
  },
  tertiary: {
    dot: "border-tertiary-container",
    time: "text-tertiary",
    icon: "text-tertiary/60",
  },
  secondary: {
    dot: "border-secondary-container",
    time: "text-secondary",
    icon: "text-secondary/60",
  },
};

function formatTimeRange(time: string, endTime?: string): string {
  const start = formatTime12h(time);
  if (!endTime) return start;
  return `${start} — ${formatTime12h(endTime)}`;
}

export function PlanTimeline({
  items,
  emptyMessage,
}: {
  items: TimelineItem[];
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return (
      <section className="space-y-4">
        <h3 className="font-playfair text-2xl font-medium text-on-surface">
          Today&apos;s Timeline
        </h3>
        <div className="glass-panel silk-border rounded-2xl p-8 text-center">
          <span className="material-symbols-outlined mb-3 text-4xl text-primary/30">
            event_busy
          </span>
          <p className="font-montserrat text-sm text-on-surface-variant">
            {emptyMessage ??
              "No schedule yet. Generate a plan or enter your schedule manually."}
          </p>
        </div>
      </section>
    );
  }

  return (
    <motion.section
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-4"
    >
      <motion.h3
        variants={staggerItem}
        className="font-playfair text-2xl font-medium text-on-surface"
      >
        Today&apos;s Timeline
      </motion.h3>

      <div className="relative space-y-8 pl-8 before:absolute before:bottom-2 before:left-[11px] before:top-2 before:w-[2px] before:bg-gradient-to-b before:from-primary/40 before:via-tertiary/20 before:to-transparent before:content-['']">
        {items.map((item) => {
          const accent = accentStyles[item.accent ?? "primary"];
          const isCalendarEvent = item.kind === "calendar_event";
          const isEmptyWindow = item.kind === "empty_window";

          return (
            <motion.div key={item.id} variants={staggerItem} className="relative">
              <div
                className={cn(
                  "absolute -left-8 top-1 z-10 h-6 w-6 rounded-full border-4 bg-white",
                  accent.dot
                )}
              />
              <motion.div
                layout
                whileHover={{ scale: 1.01, x: 4 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className={cn(
                  "glass-panel silk-border rounded-2xl p-4",
                  isCalendarEvent && "opacity-90",
                  isEmptyWindow && "border-dashed"
                )}
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <span
                    className={cn(
                      "font-montserrat text-sm font-semibold uppercase tracking-wider",
                      accent.time
                    )}
                  >
                    {formatTimeRange(item.time, item.endTime)}
                  </span>
                  <div className="flex items-center gap-2">
                    {item.kind === "plan_stop" && item.aiGenerated && (
                      <span className="rounded-full bg-tertiary/15 px-2 py-0.5 font-montserrat text-[10px] font-semibold uppercase tracking-wider text-tertiary">
                        AI Curated
                      </span>
                    )}
                    {item.icon && (
                      <span
                        className={cn(
                          "material-symbols-outlined scale-75",
                          accent.icon
                        )}
                      >
                        {item.icon}
                      </span>
                    )}
                  </div>
                </div>
                <h4 className="mb-1 font-montserrat text-lg font-semibold text-on-surface">
                  {item.activity}
                </h4>
                {item.neighborhood && (
                  <p className="mb-2 font-montserrat text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
                    {item.neighborhood}
                    {item.category ? ` · ${item.category}` : ""}
                  </p>
                )}
                {item.explanation && (
                  <p
                    className={cn(
                      "font-montserrat text-xs leading-relaxed text-on-surface-variant",
                      item.kind === "plan_stop" && "italic"
                    )}
                  >
                    {item.kind === "plan_stop" && (
                      <span className="mr-1 text-primary/40">&ldquo;</span>
                    )}
                    {item.explanation}
                  </p>
                )}
              </motion.div>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}
