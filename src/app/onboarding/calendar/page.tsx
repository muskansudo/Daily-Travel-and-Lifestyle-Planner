"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CinematicBackground } from "@/components/onboarding/CinematicBackground";
import { StitchGlassPanel } from "@/components/onboarding/StitchGlassPanel";
import { PremiumButton } from "@/components/ui/PremiumButton";
import { cn } from "@/lib/utils/cn";

function ProgressDots({ activeStep }: { activeStep: number }) {
  return (
    <div className="flex items-center gap-2">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={cn(
            "rounded-full transition-all",
            i === activeStep
              ? "h-2 w-6 bg-primary shadow-[0_0_10px_rgba(139,78,60,0.3)]"
              : "h-2 w-2 bg-on-surface-variant/20"
          )}
        />
      ))}
    </div>
  );
}

const GoogleCalIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="4" width="18" height="17" rx="2" stroke="#4285F4" strokeWidth="1.6" fill="none" />
    <path d="M3 9h18" stroke="#4285F4" strokeWidth="1.4" />
    <path d="M8 2v4M16 2v4" stroke="#4285F4" strokeWidth="1.6" strokeLinecap="round" />
    <rect x="7" y="12" width="4" height="4" rx="0.5" fill="#34A853" opacity="0.85" />
  </svg>
);

const CalendarIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-primary">
    <rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M3 9h18" stroke="currentColor" strokeWidth="1.3" />
    <path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="12" cy="15" r="2.5" fill="currentColor" opacity="0.3" />
    <circle cx="12" cy="15" r="1.2" fill="currentColor" />
  </svg>
);

const Spinner = () => (
  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
);

export default function CalendarOnboardingPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "connecting" | "success" | "error">("idle");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/onboarding/calendar")
      .then((r) => r.json())
      .then((data) => {
        if (data.onboardingCalendarComplete) {
          router.replace("/onboarding/wardrobe");
        }
      })
      .finally(() => setInitialLoading(false));
  }, [router]);

  const handleGoogleConnect = async () => {
    if (status === "connecting" || status === "success") return;
    setStatus("connecting");
    setError(null);

    try {
      // Trigger backend OAuth flow
      const res = await fetch("/api/auth/google/initiate");
      const { url } = await res.json();

      // Open Google OAuth popup
      const popup = window.open(url, "google_oauth", "width=500,height=600");

      // Listen for success message from callback
      const handler = (e: MessageEvent) => {
        if (e.data?.type === "GOOGLE_AUTH_SUCCESS") {
          setStatus("success");
          window.removeEventListener("message", handler);
          popup?.close();
          // Navigate to next onboarding step after 1.2s
          setTimeout(() => {
            router.push("/onboarding/wardrobe");
          }, 1200);
        }
        if (e.data?.type === "GOOGLE_AUTH_ERROR") {
          setStatus("error");
          setError("Google Authentication failed. Please try again.");
          window.removeEventListener("message", handler);
          popup?.close();
        }
      };

      window.addEventListener("message", handler);

      // Fallback: if popup is closed manually
      const pollTimer = setInterval(() => {
        if (popup?.closed) {
          clearInterval(pollTimer);
          setStatus((prev) => (prev === "connecting" ? "idle" : prev));
        }
      }, 800);
    } catch {
      setStatus("error");
      setError("Failed to initiate Google Calendar connection.");
    }
  };

  const handleSkip = useCallback(async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/onboarding/calendar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Could not skip calendar sync"
        );
        return;
      }

      router.push(data.nextPath ?? "/onboarding/wardrobe");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  if (initialLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface font-montserrat text-on-surface-variant">
        Loading…
      </div>
    );
  }

  const isConnecting = status === "connecting";
  const isSuccess = status === "success";

  return (
    <div className="relative min-h-dvh overflow-hidden font-montserrat">
      <CinematicBackground />

      <main className="relative z-10 flex min-h-dvh flex-col items-center px-6 py-10">
        <div className="mt-1 w-full max-w-[500px] animate-soft-rise">
          <header className="mb-10 w-full text-center">
            <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/50 bg-primary/10">
              <CalendarIcon />
            </div>
            <h1 className="mb-2 font-playfair text-[28px] font-semibold leading-tight text-primary md:text-[32px]">
              Sync your rhythm.
            </h1>
            <p className="mx-auto max-w-[340px] font-montserrat text-base leading-relaxed text-on-surface-variant">
              Integrate your existing flow to find perfect alignment in your daily schedule.
            </p>
          </header>

          <StitchGlassPanel shimmer={isConnecting} className="space-y-8 pb-10">
            <div className="space-y-4">
              {/* Google Calendar — active */}
              <button
                type="button"
                className="flex w-full items-center justify-between gap-4 rounded-full border border-white/20 bg-white/5 px-6 py-4 font-montserrat text-sm font-semibold text-on-surface backdrop-blur-md transition-all hover:bg-white/10 hover:shadow-lg disabled:opacity-50"
                onClick={handleGoogleConnect}
                disabled={isConnecting || isSuccess}
                aria-label="Connect Google Calendar"
              >
                <div className="flex items-center gap-3">
                  <GoogleCalIcon />
                  <span>Google Calendar</span>
                </div>
                <div className="flex items-center gap-2">
                  {isConnecting && <Spinner />}
                  {isSuccess && (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  )}
                  {!isConnecting && !isSuccess && (
                    <span className="text-on-surface-variant/40">›</span>
                  )}
                </div>
              </button>

              {/* Apple Calendar — coming soon */}
              <button
                type="button"
                className="flex w-full items-center justify-between gap-4 rounded-full border border-white/5 bg-white/5 px-6 py-4 font-montserrat text-sm font-semibold text-on-surface-variant/50 opacity-50 cursor-not-allowed"
                disabled
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[22px]">calendar_today</span>
                  <span>Apple Calendar</span>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">Soon</span>
              </button>

              {/* Outlook — coming soon */}
              <button
                type="button"
                className="flex w-full items-center justify-between gap-4 rounded-full border border-white/5 bg-white/5 px-6 py-4 font-montserrat text-sm font-semibold text-on-surface-variant/50 opacity-50 cursor-not-allowed"
                disabled
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[22px]">mail</span>
                  <span>Outlook Calendar</span>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">Soon</span>
              </button>
            </div>

            <footer className="flex w-full flex-col items-center pt-2">
              <PremiumButton
                disabled={!isSuccess || loading}
                onClick={() => router.push("/onboarding/wardrobe")}
                className={cn(
                  isSuccess
                    ? "shadow-[0_15px_30px_-5px_rgba(139,78,60,0.35)]"
                    : "opacity-40"
                )}
              >
                {loading ? "Saving…" : "Continue"}
              </PremiumButton>
              <button
                type="button"
                disabled={loading || isConnecting || isSuccess}
                onClick={handleSkip}
                className="mb-4 mt-4 font-montserrat text-sm font-semibold text-primary/70 transition-colors hover:text-primary disabled:opacity-50"
              >
                I&apos;ll do this later
              </button>
              <ProgressDots activeStep={2} />
              {error && (
                <p className="mt-4 font-montserrat text-sm text-error" role="alert">
                  {error}
                </p>
              )}
            </footer>
          </StitchGlassPanel>
        </div>
      </main>
    </div>
  );
}
