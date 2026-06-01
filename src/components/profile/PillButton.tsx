"use client";

import { cn } from "@/lib/utils/cn";
import { type ButtonHTMLAttributes, type ReactNode } from "react";

type ButtonVariant = "primary" | "secondary-glass" | "ghost" | "destructive" | "ai";
type ButtonSize = "lg" | "md" | "sm";

interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  icon?: ReactNode;
  iconPosition?: "left" | "right";
}

/**
 * PillButton
 * Shape: always rounded-full
 * Sizes: lg 52px | md 44px | sm 36px
 */
export function PillButton({
  variant = "primary",
  size = "md",
  children,
  icon,
  iconPosition = "left",
  className,
  disabled,
  ...props
}: PillButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full font-montserrat font-semibold tracking-[0.05em] transition-all duration-150 select-none";

  const variants: Record<ButtonVariant, string> = {
    primary:
      "bg-primary text-on-primary hover:opacity-90 active:scale-[0.96] shadow-glow-md",
    "secondary-glass":
      "bg-white/30 backdrop-blur-sm border border-white/40 text-on-surface hover:bg-white/45 active:bg-white/55",
    ghost:
      "bg-transparent text-primary hover:bg-primary/8 active:bg-primary/12",
    destructive:
      "bg-error text-on-error hover:opacity-90 active:scale-[0.96]",
    ai:
      "bg-gradient-to-r from-tertiary to-[#9b6ec8] text-on-tertiary hover:opacity-90 active:scale-[0.96] shadow-glow-ai",
  };

  const sizes: Record<ButtonSize, string> = {
    lg: "h-[52px] px-8 text-[14px]",
    md: "h-[44px] px-6 text-[14px]",
    sm: "h-[36px] px-4 text-[11px] uppercase tracking-wider",
  };

  const disabledStyle = disabled
    ? "opacity-40 pointer-events-none cursor-not-allowed"
    : "";

  return (
    <button
      disabled={disabled}
      className={cn(base, variants[variant], sizes[size], disabledStyle, className)}
      {...props}
    >
      {icon && iconPosition === "left" && icon}
      {children}
      {icon && iconPosition === "right" && icon}
    </button>
  );
}

/** Toggle switch */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full",
        "transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-primary/40",
        checked
          ? "bg-gradient-to-r from-tertiary to-[#9b6ec8]"
          : "bg-outline-variant"
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm",
          "transition-all duration-300",
          checked ? "left-[22px]" : "left-0.5"
        )}
      />
    </button>
  );
}

/** Diet/preference chip */
export function PreferenceChip({
  label,
  icon,
  selected,
  onClick,
  isAI = false,
}: {
  label: string;
  icon: string;
  selected: boolean;
  onClick: () => void;
  isAI?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 h-8 px-4 rounded-full",
        "font-montserrat text-[13px] transition-all duration-200",
        "border focus-visible:ring-2 focus-visible:ring-primary/40",
        selected && !isAI
          ? "bg-primary-container border-primary-container text-on-primary-container font-semibold"
          : selected && isAI
          ? "bg-tertiary-container/80 border-tertiary-container text-on-tertiary-container font-semibold"
          : "bg-surface-container-high/70 border-outline-variant text-on-surface-variant hover:bg-surface-container-highest"
      )}
    >
      <span>{icon}</span>
      <span>{label}</span>
      {selected && (
        <span
          className={cn(
            "ml-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full",
            isAI
              ? "bg-tertiary text-on-tertiary"
              : "bg-primary text-on-primary"
          )}
        >
          Active
        </span>
      )}
    </button>
  );
}
