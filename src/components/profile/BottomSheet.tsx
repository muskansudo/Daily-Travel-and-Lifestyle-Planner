"use client";

import { cn } from "@/lib/utils/cn";
import { type ReactNode, useEffect } from "react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  className?: string;
}

/**
 * BottomSheet
 * Level 3 glass, rounded-t-xl (48px top corners)
 * Handle 36×4px centered, 12px top margin
 * Motion: sheet-ascend
 */
export function BottomSheet({
  open,
  onClose,
  children,
  title,
  className,
}: BottomSheetProps) {
  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Scrim */}
      <div
        className="absolute inset-0 bg-inverse-surface/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={cn(
          // Level 3 glass
          "glass-modal relative w-full max-w-content mx-auto",
          // Rounded top corners (48px = rounded-xl)
          "rounded-t-xl",
          // Padding
          "px-6 pb-safe pt-3",
          // Motion
          "animate-sheet-ascend",
          className
        )}
        style={{ paddingBottom: `calc(24px + env(safe-area-inset-bottom))` }}
      >
        {/* Handle */}
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-outline-variant/60" />

        {title && (
          <h3 className="font-playfair text-2xl font-semibold text-on-surface mb-5">
            {title}
          </h3>
        )}

        {children}
      </div>
    </div>
  );
}

/** Glass input field */
export function GlassInput({
  label,
  className,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {label && (
        <label className="font-montserrat text-[11px] font-semibold tracking-[0.08em] uppercase text-on-surface-variant">
          {label}
        </label>
      )}
      <input
        className={cn(
          "h-12 w-full rounded-full px-5",
          "bg-white/25 backdrop-blur-sm",
          "border border-outline-variant/50",
          "font-montserrat text-[15px] text-on-surface placeholder:text-on-surface-variant/70",
          "transition-all duration-150 outline-none",
          "focus:border-primary focus:shadow-glow-focus",
          error && "border-error",
          className
        )}
        {...props}
      />
      {error && (
        <p className="font-montserrat text-[12px] text-error">{error}</p>
      )}
    </div>
  );
}

/** Glass select */
export function GlassSelect({
  label,
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {label && (
        <label className="font-montserrat text-[11px] font-semibold tracking-[0.08em] uppercase text-on-surface-variant">
          {label}
        </label>
      )}
      <select
        className={cn(
          "h-12 w-full rounded-full px-5",
          "bg-white/25 backdrop-blur-sm",
          "border border-outline-variant/50",
          "font-montserrat text-[15px] text-on-surface",
          "transition-all duration-150 outline-none",
          "focus:border-primary focus:shadow-glow-focus",
          className
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}
