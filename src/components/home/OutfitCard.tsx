"use client";

import { motion } from "framer-motion";
import type { OutfitRecommendation } from "@/lib/types/home";
import { fadeUp } from "./animations";

export function OutfitCard({
  outfit,
}: {
  outfit: OutfitRecommendation | null;
}) {
  return (
    <motion.section
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      className="space-y-4"
    >
      <h3 className="font-playfair text-2xl font-medium text-on-surface">
        Outfit Recommendation
      </h3>
      {!outfit ? (
        <div className="glass-panel silk-border rounded-2xl p-8 text-center">
          <span className="material-symbols-outlined mb-3 text-4xl text-secondary/30">
            checkroom
          </span>
          <p className="font-montserrat text-sm text-on-surface-variant">
            Outfit recommendations will appear here once your plan is generated.
          </p>
        </div>
      ) : (
        <motion.div
          layout
          whileHover={{ scale: 1.005 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="glass-panel silk-border flex flex-col overflow-hidden rounded-2xl md:flex-row"
        >
          <div className="h-64 w-full overflow-hidden md:h-auto md:w-1/2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={outfit.imageUrl}
              alt={outfit.title}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="flex flex-col justify-center p-6 md:w-1/2">
            <span className="mb-2 font-montserrat text-xs font-semibold uppercase tracking-widest text-secondary">
              {outfit.subtitle}
            </span>
            <h4 className="mb-4 font-playfair text-2xl font-medium text-on-surface">
              {outfit.title}
            </h4>
            <div className="relative rounded-xl bg-primary/5 p-4">
              <span className="material-symbols-outlined absolute -left-1 -top-3 scale-150 text-primary/20">
                format_quote
              </span>
              <p className="font-montserrat text-sm italic leading-relaxed text-on-surface-variant">
                {outfit.explanation}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </motion.section>
  );
}
