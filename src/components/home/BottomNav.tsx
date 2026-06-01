"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";

export type NavTab = "today" | "friends" | "profile";

const NAV_ITEMS: {
  id: NavTab;
  label: string;
  icon: string;
  href: string;
}[] = [
  { id: "today", label: "Today", icon: "home_app_logo", href: "/home" },
  { id: "friends", label: "Friends", icon: "group", href: "#" },
  { id: "profile", label: "Profile", icon: "person", href: "/profile" },
];

export function BottomNav({ activeTab = "today" }: { activeTab?: NavTab }) {
  return (
    <nav className="fixed bottom-6 left-1/2 z-40 w-[calc(100%-48px)] max-w-[400px] -translate-x-1/2 rounded-full border border-white/20 bg-surface-container/60 px-4 py-3 shadow-[0_20px_40px_rgba(139,78,60,0.15)] backdrop-blur-2xl">
      <div className="flex items-center justify-around">
        {NAV_ITEMS.map((item) => {
          const isActive = item.id === activeTab;
          return (
            <motion.a
              key={item.id}
              href={item.href}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className={cn(
                "flex flex-col items-center justify-center rounded-full px-4 py-2 transition-all duration-500",
                isActive
                  ? "bg-primary/20 text-primary shadow-[0_0_15px_rgba(139,78,60,0.3)]"
                  : "text-on-surface-variant/60 hover:bg-white/10"
              )}
            >
              <span
                className="material-symbols-outlined text-[24px]"
                style={{
                  fontVariationSettings: isActive
                    ? '"FILL" 1, "wght" 400'
                    : '"FILL" 0, "wght" 400',
                }}
              >
                {item.icon}
              </span>
              <span className="mt-0.5 font-montserrat text-[11px] font-semibold leading-none tracking-wide">
                {item.label}
              </span>
            </motion.a>
          );
        })}
      </div>
    </nav>
  );
}
