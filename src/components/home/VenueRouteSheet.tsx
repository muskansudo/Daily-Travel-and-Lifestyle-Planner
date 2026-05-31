"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { VenueRecommendation } from "@/lib/types/home";
import {
  backdropVariants,
  sheetVariants,
  staggerContainer,
  staggerItem,
} from "./animations";

const TRANSPORT_LABELS = {
  walking: { label: "Walking", icon: "directions_walk" },
  driving: { label: "Driving", icon: "directions_car" },
  transit: { label: "Transit", icon: "directions_transit" },
} as const;

function RouteMapPreview({ venueName }: { venueName: string }) {
  return (
    <div className="relative h-48 overflow-hidden rounded-2xl bg-gradient-to-br from-surface-container-low via-white/40 to-tertiary/10">
      <svg
        viewBox="0 0 320 180"
        className="h-full w-full"
        aria-hidden
      >
        <defs>
          <pattern
            id="grid"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 20 0 L 0 0 0 20"
              fill="none"
              stroke="rgba(139, 78, 60, 0.08)"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="320" height="180" fill="url(#grid)" />

        <motion.path
          d="M 48 140 C 80 120, 120 80, 160 70 S 240 50, 272 40"
          fill="none"
          stroke="rgba(139, 78, 60, 0.15)"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <motion.path
          d="M 48 140 C 80 120, 120 80, 160 70 S 240 50, 272 40"
          fill="none"
          stroke="#8b4e3c"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="8 6"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
        />

        <circle cx="48" cy="140" r="8" fill="#fef8f3" stroke="#8b4e3c" strokeWidth="3" />
        <circle cx="48" cy="140" r="3" fill="#8b4e3c" />

        <circle cx="272" cy="40" r="10" fill="#714f96" opacity="0.2" />
        <circle cx="272" cy="40" r="8" fill="#fef8f3" stroke="#714f96" strokeWidth="3" />
        <circle cx="272" cy="40" r="3" fill="#714f96" />
      </svg>

      <div className="absolute bottom-3 left-3 rounded-full bg-white/80 px-3 py-1 font-montserrat text-[10px] font-semibold uppercase tracking-wider text-primary backdrop-blur-sm">
        You
      </div>
      <div className="absolute right-3 top-3 max-w-[120px] truncate rounded-full bg-white/80 px-3 py-1 font-montserrat text-[10px] font-semibold uppercase tracking-wider text-tertiary backdrop-blur-sm">
        {venueName}
      </div>
    </div>
  );
}

export function VenueRouteSheet({
  venue,
  open,
  onClose,
}: {
  venue: VenueRecommendation | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!venue) return null;

  const transport = TRANSPORT_LABELS[venue.route.transportMode];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="route-backdrop"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            key="route-sheet"
            variants={sheetVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-x-0 bottom-0 z-[61] mx-auto max-h-[90dvh] max-w-[600px] overflow-hidden rounded-t-3xl border border-white/40 bg-surface/95 shadow-glow-lg backdrop-blur-2xl"
          >
            <div className="flex justify-center py-3">
              <div className="h-1 w-10 rounded-full bg-outline-variant/60" />
            </div>

            <div className="flex items-start justify-between px-6 pb-4">
              <div>
                <h2 className="font-playfair text-xl font-semibold text-on-surface">
                  Route to {venue.name}
                </h2>
                <p className="mt-0.5 font-montserrat text-xs text-on-surface-variant">
                  {venue.location.address}
                </p>
              </div>
              <motion.button
                whileTap={{ scale: 0.9 }}
                type="button"
                onClick={onClose}
                className="rounded-full p-2 hover:bg-white/20"
                aria-label="Close route"
              >
                <span className="material-symbols-outlined text-on-surface-variant">
                  close
                </span>
              </motion.button>
            </div>

            <div className="no-scrollbar max-h-[calc(90dvh-180px)] overflow-y-auto px-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <RouteMapPreview venueName={venue.name} />

              <div className="mt-4 flex gap-3">
                <div className="glass-panel flex flex-1 items-center gap-3 rounded-xl p-3">
                  <span className="material-symbols-outlined text-primary">
                    {transport.icon}
                  </span>
                  <div>
                    <p className="font-montserrat text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                      Mode
                    </p>
                    <p className="font-montserrat text-sm font-semibold text-on-surface">
                      {transport.label}
                    </p>
                  </div>
                </div>
                <div className="glass-panel flex flex-1 items-center gap-3 rounded-xl p-3">
                  <span className="material-symbols-outlined text-primary">
                    schedule
                  </span>
                  <div>
                    <p className="font-montserrat text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                      ETA
                    </p>
                    <p className="font-montserrat text-sm font-semibold text-on-surface">
                      {venue.route.durationMinutes} min
                    </p>
                  </div>
                </div>
                <div className="glass-panel flex flex-1 items-center gap-3 rounded-xl p-3">
                  <span className="material-symbols-outlined text-primary">
                    straighten
                  </span>
                  <div>
                    <p className="font-montserrat text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                      Distance
                    </p>
                    <p className="font-montserrat text-sm font-semibold text-on-surface">
                      {venue.distance}
                    </p>
                  </div>
                </div>
              </div>

              <motion.ol
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                className="mt-6 space-y-3"
              >
                <p className="font-montserrat text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                  Directions
                </p>
                {venue.route.steps.map((step, index) => (
                  <motion.li
                    key={`${venue.id}-step-${index}`}
                    variants={staggerItem}
                    className="flex gap-3"
                  >
                    <div className="flex flex-col items-center">
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 font-montserrat text-xs font-semibold text-primary">
                        {index + 1}
                      </div>
                      {index < venue.route.steps.length - 1 && (
                        <div className="mt-1 w-px flex-1 bg-primary/20" />
                      )}
                    </div>
                    <div className="pb-3 pt-0.5">
                      <p className="font-montserrat text-sm text-on-surface">
                        {step.instruction}
                      </p>
                      <p className="mt-0.5 font-montserrat text-xs text-on-surface-variant">
                        {step.distance}
                      </p>
                    </div>
                  </motion.li>
                ))}
              </motion.ol>

              <motion.button
                type="button"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                className="btn-premium mt-6 flex w-full items-center justify-center gap-2 rounded-full py-4 font-montserrat text-sm font-semibold uppercase tracking-wider"
              >
                <span className="material-symbols-outlined text-[20px]">
                  navigation
                </span>
                Start Navigation
              </motion.button>
              <p className="mt-2 text-center font-montserrat text-[11px] text-on-surface-variant/60">
                Live turn-by-turn navigation coming soon
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
