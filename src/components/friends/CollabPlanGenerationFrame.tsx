"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FriendAvatar } from "@/components/friends/FriendAvatar";
import { fadeUp } from "@/components/home/animations";
import { cn } from "@/lib/utils/cn";

/** Minimum time on the loading screen before transitioning (5–6s total with exit fade). */
const MIN_DISPLAY_MS = 5500;
const ORBIT_SIZE = "h-20 w-20";

export interface CollabGenerationProfile {
  displayName: string | null;
  profilePhotoUrl: string | null;
}

function OrbitAvatar({
  profile,
  variant,
}: {
  profile: CollabGenerationProfile;
  variant: "me" | "friend";
}) {
  return (
    <div
      className={cn(
        "absolute -left-10 -top-10",
        ORBIT_SIZE,
        variant === "me" ? "animate-collab-orbit" : "animate-collab-orbit-delayed"
      )}
    >
      <div className="relative h-full w-full">
        <div
          className={cn(
            "pointer-events-none absolute inset-0 rounded-full blur-xl",
            variant === "me" ? "bg-primary/20" : "bg-tertiary/20"
          )}
          aria-hidden
        />
        <div className="glass-panel relative h-full w-full overflow-hidden rounded-full border-2 border-white shadow-lg">
          <FriendAvatar
            displayName={profile.displayName}
            profilePhotoUrl={profile.profilePhotoUrl}
            className="!h-full !w-full !border-0 !shadow-none"
          />
        </div>
      </div>
    </div>
  );
}

export function CollabPlanGenerationFrame({
  me,
  friend,
  friendName,
  ready = true,
  onComplete,
}: {
  me: CollabGenerationProfile;
  friend: CollabGenerationProfile;
  friendName: string;
  ready?: boolean;
  onComplete: () => void;
}) {
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinTimeElapsed(true), MIN_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (minTimeElapsed && ready) {
      const timer = setTimeout(onComplete, 500);
      return () => clearTimeout(timer);
    }
  }, [minTimeElapsed, ready, onComplete]);

  const meLabel = me.displayName?.trim() || "You";
  const friendLabel = friend.displayName?.trim() || friendName;

  return (
    <motion.section
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="relative flex min-h-[420px] flex-col items-center justify-center py-10"
      aria-live="polite"
      aria-busy="true"
    >
      {/* Celestial orbit — inspired by Matching Energies mock */}
      <div className="relative mb-10 flex h-[280px] w-[280px] items-center justify-center">
        <div
          className="pointer-events-none absolute inset-0 animate-collab-pulse-glow rounded-full bg-primary/5 blur-[80px]"
          aria-hidden
        />

        <div className="absolute z-10 flex animate-collab-sparkle flex-col items-center">
          <div className="rounded-full border border-white/60 bg-white/40 p-4 shadow-[0_0_40px_rgba(139,78,60,0.18)] backdrop-blur-3xl">
            <span
              className="material-symbols-outlined text-[28px] text-primary"
              style={{ fontVariationSettings: '"FILL" 1' }}
            >
              auto_awesome
            </span>
          </div>
        </div>

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative h-0 w-0">
            <OrbitAvatar profile={me} variant="me" />
            <OrbitAvatar profile={friend} variant="friend" />
          </div>
        </div>
      </div>

      <h2 className="mb-2 text-center font-playfair text-2xl font-semibold tracking-tight text-on-surface sm:text-[28px]">
        Planning together
      </h2>
      <p className="max-w-[300px] text-center font-montserrat text-base font-light leading-relaxed text-on-surface-variant/70">
        <span className="font-medium text-on-surface/85">{meLabel}</span>
        {" & "}
        <span className="font-medium text-on-surface/85">{friendLabel}</span>
        {" — curating a plan for both of you"}
      </p>

      <div className="relative mt-10 h-0.5 w-56 overflow-hidden rounded-full bg-white/25">
        <div
          className="absolute left-0 top-0 h-full w-1/3 animate-collab-shimmer rounded-full bg-primary-container"
          style={{ boxShadow: "0 0 10px rgba(232, 155, 134, 0.65)" }}
        />
      </div>
    </motion.section>
  );
}
