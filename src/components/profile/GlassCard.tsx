"use client";

import { cn } from "@/lib/utils/cn";
import { type ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  level?: 1 | 2 | 3;
  onClick?: () => void;
  as?: keyof JSX.IntrinsicElements;
}

/**
 * GlassCard — core container
 * Level 1: ambient list cards
 * Level 2: active plan / primary card (default)
 * Level 3: sheets / dialogs
 */
export function GlassCard({
  children,
  className,
  level = 1,
  onClick,
  as: Tag = "div",
}: GlassCardProps) {
  const levelStyles: Record<number, string> = {
    1: "bg-white/40 backdrop-blur-[32px]",
    2: "bg-white/55 backdrop-blur-[48px]",
    3: "bg-white/82 backdrop-blur-[64px]",
  };

  return (
    <Tag
      onClick={onClick}
      className={cn(
        "rounded-3xl p-6",
        levelStyles[level],
        // Silk border
        "border border-white/35 border-t-white/60",
        // Drop glow
        "shadow-glow",
        onClick && "cursor-pointer transition-all duration-150 active:scale-[0.98] active:opacity-90",
        className
      )}
    >
      {children}
    </Tag>
  );
}

/** AICard — lavender glass, only for intelligence moments */
export function AICard({
  children,
  className,
  isLoading = false,
}: {
  children: ReactNode;
  className?: string;
  isLoading?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative rounded-3xl p-6 overflow-hidden",
        "glass-ai",
        className
      )}
    >
      {isLoading && (
        <div className="absolute inset-0 shimmer-ai rounded-3xl pointer-events-none" />
      )}
      {children}
    </div>
  );
}

/** SectionTitle — headline-md Playfair */
export function SectionTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "font-playfair text-2xl font-medium leading-[1.3] text-on-surface",
        className
      )}
    >
      {children}
    </h2>
  );
}

/** OverlineLabel — label-md uppercase */
export function OverlineLabel({
  children,
  className,
  variant = "default",
}: {
  children: ReactNode;
  className?: string;
  variant?: "default" | "ai";
}) {
  return (
    <p
      className={cn(
        "font-montserrat text-[11px] font-semibold tracking-[0.1em] uppercase",
        variant === "ai" ? "text-tertiary" : "text-on-surface-variant",
        className
      )}
    >
      {children}
    </p>
  );
}
