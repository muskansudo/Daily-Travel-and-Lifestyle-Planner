"use client";

import { motion } from "framer-motion";
import type { WeatherInfo } from "@/lib/types/home";
import { fadeUp } from "./animations";

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function HomeHeader({
  userName,
  weather,
  profileImageUrl,
}: {
  userName: string;
  weather?: WeatherInfo | null;
  profileImageUrl?: string | null;
}) {
  const now = new Date();

  return (
    <motion.header
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      className="fixed left-0 right-0 top-0 z-40 border-b border-white/10 bg-surface/40 px-6 py-4 backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-[600px] items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 overflow-hidden rounded-full border-2 border-white shadow-sm">
            {profileImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profileImageUrl}
                alt={userName}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-primary/10 font-playfair text-sm font-semibold text-primary">
                {userName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <h1 className="font-playfair text-xl font-semibold text-primary sm:text-2xl">
              Enchanté, {userName}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-on-surface-variant/70">
              {weather && (
                <>
                  <span className="flex items-center gap-1.5 font-montserrat text-xs font-semibold uppercase tracking-wider">
                    <span className="material-symbols-outlined text-[16px]">
                      {weather.icon}
                    </span>
                    {weather.temperature}°C • {weather.condition}
                  </span>
                  <span className="hidden text-on-surface-variant/40 sm:inline">
                    ·
                  </span>
                </>
              )}
              <span className="font-montserrat text-xs text-on-surface-variant/60">
                {formatDate(now)}
              </span>
            </div>
          </div>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          type="button"
          className="rounded-full p-2 transition-colors hover:bg-white/10"
          aria-label="Settings"
        >
          <span className="material-symbols-outlined text-primary">settings</span>
        </motion.button>
      </div>
    </motion.header>
  );
}
