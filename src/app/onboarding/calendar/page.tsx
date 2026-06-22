"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
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

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Google sign-in was cancelled.",
  invalid_callback: "Google returned an invalid response. Please try again.",
  token_exchange_failed:
    "Could not complete Google sign-in. Check your OAuth credentials and try again.",
  unknownerror:
    "Google could not complete sign-in. Add the redirect URI below to your Google Cloud OAuth client.",
};

function CalendarOnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"idle" | "connecting" | "success" | "error">("idle");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [redirectUri, setRedirectUri] = useState<string | null>(null);

  useEffect(() => {
    const googleResult = searchParams.get("google");
    const email = searchParams.get("email");
    const reason = searchParams.get("reason");

    if (googleResult === "success") {
      setStatus("success");
      if (email) setGoogleEmail(email);
      router.replace("/onboarding/calendar");
      const timer = setTimeout(() => {
        router.push("/onboarding/wardrobe");
      }, 1200);
      return () => clearTimeout(timer);
    }

    if (googleResult === "error") {
      setStatus("error");
      const key = reason ?? "unknownerror";
      setError(
        GOOGLE_ERROR_MESSAGES[key] ??
          "Google Authentication failed. Please try again."
      );
      router.replace("/onboarding/calendar");
    }
  }, [router, searchParams]);

  useEffect(() => {
    fetch("/api/auth/google/initiate")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.redirectUri) setRedirectUri(data.redirectUri);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/onboarding/calendar")
      .then((r) => r.json())
      .then((data) => {
        if (data.calendarConnected) {
          setStatus("success");
          if (data.googleEmail) {
            setGoogleEmail(data.googleEmail);
          }
        }
      })
      .catch((err) => {
        console.error("Failed to load existing calendar status:", err);
      })
      .finally(() => setInitialLoading(false));
  }, [router]);

  useEffect(() => {
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;

    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as
        | { source?: string; status?: string; email?: string; reason?: string }
        | undefined;
      if (!data || data.source !== "saanjh-gcal") return;

      if (data.status === "success") {
        setStatus("success");
        if (data.email) setGoogleEmail(data.email);
        redirectTimer = setTimeout(() => {
          router.push("/onboarding/wardrobe");
        }, 1200);
      } else if (data.status === "error") {
        setStatus("error");
        const key = data.reason ?? "unknownerror";
        setError(
          GOOGLE_ERROR_MESSAGES[key] ??
            "Google Authentication failed. Please try again."
        );
      }
    }

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, [router]);

  const handleGoogleConnect = async () => {
    if (status === "connecting" || status === "success") return;
    setStatus("connecting");
    setError(null);

    // Open the popup synchronously (before any await) so the browser
    // treats it as user-initiated and doesn't block it.
    const width = 500;
    const height = 650;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      "about:blank",
      "saanjh-google-oauth",
      `width=${width},height=${height},left=${left},top=${top}`
    );

    try {
      const res = await fetch("/api/auth/google/initiate");
      const data = res.ok ? await res.json() : null;
      if (!data?.url) throw new Error("init_failed");

      if (popup) {
        popup.location.href = data.url;
      } else {
        // Popup blocked — fall back to the old full-page redirect flow.
        window.location.href = "/api/auth/google/initiate?redirect=1";
        return;
      }
    } catch {
      if (popup) popup.close();
      setStatus("error");
      setError("Could not start Google sign-in. Please try again.");
      return;
    }

    // If the user closes the popup without finishing, reset the button.
    const interval = setInterval(() => {
      if (popup && popup.closed) {
        clearInterval(interval);
        setStatus((s) => (s === "connecting" ? "idle" : s));
      }
    }, 600);
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
      {/* Back button */}
<button
  type="button"
  onClick={() => router.push("/onboarding/preferences")}
  className="absolute left-6 top-6 z-20 flex items-center gap-1.5 font-montserrat text-sm font-semibold text-on-surface-variant/70 transition-colors hover:text-primary"
  aria-label="Go back to preferences"
>
  <span className="material-symbols-outlined text-[20px]">arrow_back</span>
  Back
</button>

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
                <div className="flex items-center gap-3 text-left">
                  <GoogleCalIcon />
                  <div className="flex flex-col">
                    <span>Google Calendar</span>
                    {isSuccess && googleEmail && (
                      <span className="text-xs font-normal text-on-surface-variant/70 animate-soft-rise">
                        Connected as {googleEmail}
                      </span>
                    )}
                  </div>
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
                <div className="mt-4 space-y-2 text-center" role="alert">
                  <p className="font-montserrat text-sm text-error">{error}</p>
                  {redirectUri && (
                    <p className="font-montserrat text-xs leading-relaxed text-on-surface-variant">
                      Register this redirect URI in Google Cloud Console →
                      Credentials → your OAuth client → Authorized redirect
                      URIs:
                      <span className="mt-1 block break-all font-mono text-[11px] text-primary">
                        {redirectUri}
                      </span>
                    </p>
                  )}
                </div>
              )}
            </footer>
          </StitchGlassPanel>
        </div>
      </main>
    </div>
  );
}

export default function CalendarOnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-surface font-montserrat text-on-surface-variant">
          Loading…
        </div>
      }
    >
      <CalendarOnboardingContent />
    </Suspense>
  );
}
