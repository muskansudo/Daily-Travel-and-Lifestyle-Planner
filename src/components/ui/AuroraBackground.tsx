"use client";

import { cn } from "@/lib/utils/cn";

export function AuroraBackground({
  children,
  className,
  variant = "default",
}: {
  children: React.ReactNode;
  className?: string;
  /** Sanctuary: soft peach/lavender corners (Profile & Friends). */
  variant?: "default" | "sanctuary";
}) {
  const isSanctuary = variant === "sanctuary";

  return (
    <div
      className={cn(
        "relative min-h-dvh overflow-hidden font-montserrat text-on-surface",
        isSanctuary ? "aurora-bg-sanctuary" : "bg-surface",
        className
      )}
    >
      {!isSanctuary && (
        <div
          className="pointer-events-none fixed inset-0 -z-10"
          style={{
            background:
              "linear-gradient(165deg, rgba(139, 78, 60, 0.08) 0%, #fef8f3 35%, rgba(196, 158, 236, 0.06) 70%, #fef8f3 100%)",
            backgroundSize: "200% 200%",
            animation: "aurora 32s ease-in-out infinite",
          }}
          aria-hidden
        />
      )}
      {children}
    </div>
  );
}
