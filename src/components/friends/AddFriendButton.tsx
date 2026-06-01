"use client";

import { motion } from "framer-motion";

export function AddFriendButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="relative flex justify-end">
      <div
        className="pointer-events-none absolute inset-0 -z-10 scale-150 opacity-70"
        style={{
          background:
            "radial-gradient(circle, rgba(232, 155, 134, 0.2) 0%, transparent 70%)",
        }}
        aria-hidden
      />
      <motion.button
        type="button"
        onClick={onClick}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        className="btn-premium flex items-center gap-2 rounded-full border border-white/20 px-5 py-2.5 font-montserrat text-[11px] font-semibold uppercase tracking-[0.2em] text-white/90 shadow-[0_4px_12px_rgba(139,78,60,0.1)] backdrop-blur-3xl"
      >
        <span className="material-symbols-outlined text-[18px] opacity-90">
          person_add
        </span>
        Add Friend
      </motion.button>
    </div>
  );
}
