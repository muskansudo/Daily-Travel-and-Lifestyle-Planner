"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import { fadeUp } from "./animations";

const STAR_COUNT = 5;

export function EveningReflection({
  onSubmit,
}: {
  onSubmit?: (rating: number, note: string) => void;
}) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const displayRating = hoverRating || rating;

  const handleSubmit = () => {
    if (rating === 0) return;
    onSubmit?.(rating, note);
    setSubmitted(true);
  };

  return (
    <motion.section
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      className="space-y-4"
    >
      <h3 className="font-playfair text-2xl font-medium text-on-surface">
        Evening Reflection
      </h3>

      <div className="glass-panel silk-border space-y-6 rounded-2xl p-6">
        <div className="text-center">
          <p className="mb-4 font-montserrat text-base text-on-surface-variant">
            How was your flow today?
          </p>
          <div className="flex justify-center gap-3">
            {Array.from({ length: STAR_COUNT }, (_, i) => {
              const starValue = i + 1;
              const filled = starValue <= displayRating;
              return (
                <motion.button
                  key={starValue}
                  type="button"
                  disabled={submitted}
                  onClick={() => setRating(starValue)}
                  onMouseEnter={() => !submitted && setHoverRating(starValue)}
                  onMouseLeave={() => setHoverRating(0)}
                  whileHover={submitted ? undefined : { scale: 1.15 }}
                  whileTap={submitted ? undefined : { scale: 0.95 }}
                  className="group disabled:cursor-default"
                  aria-label={`Rate ${starValue} out of ${STAR_COUNT}`}
                >
                  <span
                    className={cn(
                      "material-symbols-outlined text-[32px] transition-colors",
                      filled ? "text-primary" : "text-primary/30"
                    )}
                    style={{
                      fontVariationSettings: filled ? '"FILL" 1' : '"FILL" 0',
                    }}
                  >
                    star
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>

        <div className="relative">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={submitted}
            placeholder="Add a note about today..."
            className="min-h-[100px] w-full resize-none rounded-2xl border border-white/40 bg-white/20 p-4 font-montserrat text-base text-on-surface placeholder:text-on-surface-variant/50 outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          />
        </div>

        {submitted ? (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center font-montserrat text-sm text-primary"
          >
            Thank you for reflecting on your day.
          </motion.p>
        ) : (
          <motion.button
            type="button"
            onClick={handleSubmit}
            disabled={rating === 0}
            whileHover={rating > 0 ? { scale: 1.01 } : undefined}
            whileTap={rating > 0 ? { scale: 0.98 } : undefined}
            className="w-full rounded-full bg-primary py-4 font-montserrat text-sm font-semibold uppercase tracking-wider text-on-primary shadow-lg shadow-primary/20 transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            Submit Review
          </motion.button>
        )}
      </div>
    </motion.section>
  );
}
