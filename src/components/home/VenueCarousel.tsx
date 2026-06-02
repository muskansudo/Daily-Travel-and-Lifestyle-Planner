"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { VenueRecommendation } from "@/lib/types/home";
import { VenueRecommendationCard } from "@/components/venues";
import { fadeUp, staggerContainer } from "./animations";
import { VenueRouteSheet } from "./VenueRouteSheet";

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
          <VenueRecommendationCard
            venue={topPick}
            featured
            onNavigate={openRoute}
          />
          {alternatives.map((venue) => (
            <VenueRecommendationCard
              key={venue.id}
              venue={venue}
              onNavigate={openRoute}
            />
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
