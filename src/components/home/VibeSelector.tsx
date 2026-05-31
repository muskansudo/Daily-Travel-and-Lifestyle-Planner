"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import { ChipSelect } from "@/components/ui/ChipSelect";
import {
  DEFAULT_VIBE_IMAGE,
  MAX_VIBE_SELECTIONS,
  VIBE_OPTIONS,
} from "@/lib/constants/vibes";
import type { VibeId } from "@/lib/types/home";
import { fadeUp } from "./animations";

export function VibeSelector({
  vibeImageUrl,
  vibeImageFile,
  selectedVibes,
  onImageChange,
  onVibesChange,
}: {
  vibeImageUrl: string;
  vibeImageFile: File | null;
  selectedVibes: VibeId[];
  onImageChange: (url: string, file: File | null) => void;
  onVibesChange: (vibes: VibeId[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImageChange(URL.createObjectURL(file), file);
    }
  };

  const handleRemoveImage = () => {
    onImageChange(DEFAULT_VIBE_IMAGE, null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleVibesChange = (ids: string[]) => {
    if (ids.length > MAX_VIBE_SELECTIONS && ids.length > selectedVibes.length) {
      return;
    }
    onVibesChange(ids as VibeId[]);
  };

  return (
    <motion.section
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      className="relative group"
    >
      <div
        className="pointer-events-none absolute -inset-4 -z-10 rounded-xl opacity-40 blur-[60px]"
        style={{ background: "rgba(139, 78, 60, 0.1)" }}
        aria-hidden
      />
      <div className="glass-panel silk-border overflow-hidden rounded-2xl">
        <div className="relative h-48 w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={vibeImageUrl || DEFAULT_VIBE_IMAGE}
            alt="Today's vibe"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
          {vibeImageFile ? (
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.9 }}
              type="button"
              onClick={handleRemoveImage}
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-white/30 text-white backdrop-blur-md transition-colors hover:bg-white/50"
              title="Remove vibe image"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </motion.button>
          ) : (
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.9 }}
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-white/30 text-white backdrop-blur-md transition-colors hover:bg-white/50"
              title="Upload your own vibe"
            >
              <span className="material-symbols-outlined text-[20px]">
                add_a_photo
              </span>
            </motion.button>
          )}
          <div className="absolute bottom-4 left-4 right-4">
            <span className="mb-1 block font-montserrat text-xs font-semibold uppercase tracking-wider text-white/90">
              Set Today&apos;s Vibe
            </span>
            <h2 className="font-playfair text-2xl font-semibold text-white sm:text-[28px]">
              How does today feel?
            </h2>
          </div>
        </div>
        <div className="space-y-5 p-4">
          <p className="font-montserrat text-sm leading-snug text-on-surface-variant">
            Upload a photo that captures today&apos;s mood — Saanjh uses it to
            shape your schedule, outfit, and venues so your day feels
            intentionally yours.
          </p>
          <ChipSelect
            label="Today's vibes"
            hint={`Pick up to ${MAX_VIBE_SELECTIONS} moods`}
            options={VIBE_OPTIONS}
            selected={selectedVibes}
            onChange={handleVibesChange}
          />
        </div>
      </div>
    </motion.section>
  );
}
