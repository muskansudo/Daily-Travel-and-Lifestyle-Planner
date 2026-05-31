"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { VenueRecommendation } from "@/lib/types/home";
import { cn } from "@/lib/utils/cn";
import { fadeUp, staggerContainer, staggerItem } from "./animations";
import { VenueRouteSheet } from "./VenueRouteSheet";

function VenueCard({
  venue,
  featured,
  onNavigate,
}: {
  venue: VenueRecommendation;
  featured?: boolean;
  onNavigate: (venue: VenueRecommendation) => void;
}) {
  return (
    <motion.article
      variants={staggerItem}
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "glass-panel silk-border relative flex-shrink-0 overflow-hidden rounded-2xl",
        featured ? "w-[85vw] max-w-[340px] sm:w-[320px]" : "w-[260px]"
      )}
    >
      <div className="relative h-36 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={venue.imageUrl}
          alt={venue.name}
          className="h-full w-full object-cover"
        />
        {featured && (
          <span className="absolute left-3 top-3 rounded-full bg-primary px-3 py-1 font-montserrat text-[10px] font-semibold uppercase tracking-wider text-on-primary">
            Top Pick
          </span>
        )}
      </div>
      <div className="p-4">
        <h4 className="font-playfair text-lg font-semibold text-on-surface">
          {venue.name}
        </h4>
        <p className="mt-0.5 font-montserrat text-xs text-on-surface-variant">
          {venue.category}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 text-primary">
            <span className="material-symbols-outlined text-[14px]">
              location_on
            </span>
            <span className="font-montserrat text-xs font-semibold">
              {venue.distance} away
            </span>
          </div>
          <motion.button
            type="button"
            onClick={() => onNavigate(venue)}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 font-montserrat text-[10px] font-semibold uppercase tracking-wider text-primary transition-colors hover:bg-primary/20"
          >
            <span className="material-symbols-outlined text-[14px]">
              directions
            </span>
            Route
          </motion.button>
        </div>
        <p className="mt-3 font-montserrat text-xs leading-relaxed text-on-surface-variant/80">
          {venue.whyThisVenue}
        </p>
      </div>
    </motion.article>
  );
}

export function VenueCarousel({ venues }: { venues: VenueRecommendation[] }) {
  const [routeVenue, setRouteVenue] = useState<VenueRecommendation | null>(
    null
  );
  const [routeSheetOpen, setRouteSheetOpen] = useState(false);

  const openRoute = (venue: VenueRecommendation) => {
    setRouteVenue(venue);
    setRouteSheetOpen(true);
  };

  const closeRoute = () => {
    setRouteSheetOpen(false);
  };

  if (venues.length === 0) {
    return (
      <section className="space-y-4">
        <h3 className="font-playfair text-2xl font-medium text-on-surface">
          Venue Recommendations
        </h3>
        <div className="glass-panel silk-border rounded-2xl p-8 text-center">
          <span className="material-symbols-outlined mb-3 text-4xl text-tertiary/30">
            store
          </span>
          <p className="font-montserrat text-sm text-on-surface-variant">
            No venue recommendations yet.
          </p>
        </div>
      </section>
    );
  }

  const topPick = venues.find((v) => v.isTopPick) ?? venues[0];
  const alternatives = venues.filter((v) => v.id !== topPick.id);

  return (
    <>
      <motion.section
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="space-y-4"
      >
        <div>
          <h3 className="font-playfair text-2xl font-medium text-on-surface">
            Venue Recommendations
          </h3>
          <p className="mt-1 font-montserrat text-xs text-on-surface-variant">
            Curated for your vibe and schedule
          </p>
        </div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="no-scrollbar -mx-6 flex gap-4 overflow-x-auto px-6 pb-2"
        >
          <VenueCard venue={topPick} featured onNavigate={openRoute} />
          {alternatives.map((venue) => (
            <VenueCard key={venue.id} venue={venue} onNavigate={openRoute} />
          ))}
        </motion.div>
      </motion.section>

      <VenueRouteSheet
        venue={routeVenue}
        open={routeSheetOpen}
        onClose={closeRoute}
      />
    </>
  );
}
