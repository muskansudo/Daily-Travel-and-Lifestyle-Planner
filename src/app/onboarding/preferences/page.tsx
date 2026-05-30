"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CinematicBackground } from "@/components/onboarding/CinematicBackground";
import { StitchGlassPanel } from "@/components/onboarding/StitchGlassPanel";
import { PremiumButton } from "@/components/ui/PremiumButton";
import { StitchChipGroup } from "@/components/ui/StitchChipGroup";
import {
  DIETARY_OPTIONS,
  INTEREST_OPTIONS,
  LIFESTYLE_OPTIONS,
} from "@/lib/constants/preferences";
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

export default function PreferencesOnboardingPage() {
  const router = useRouter();
  const [dietary, setDietary] = useState<string[]>([]);
  const [lifestyle, setLifestyle] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const hasSelection =
    dietary.length +
      lifestyle.length +
      interests.length +
    0;

  useEffect(() => {
    fetch("/api/onboarding/preferences")
      .then((r) => r.json())
      .then((data) => {
        if (data.dietaryTags?.length) setDietary(data.dietaryTags);
        if (data.lifestyleTags?.length) setLifestyle(data.lifestyleTags);
        if (data.interestTags?.length) setInterests(data.interestTags);
       
      })
      .finally(() => setInitialLoading(false));
  }, [router]);

  const save = useCallback(
    async (skip: boolean) => {
      setError(null);
      setLoading(true);

      try {
        const res = await fetch("/api/onboarding/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dietaryTags: dietary,
            lifestyleTags: lifestyle,
            interestTags: interests,
            skip,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(
            typeof data.error === "string"
              ? data.error
              : "Could not save preferences"
          );
          return;
        }

        router.push(data.nextPath ?? "/onboarding/calendar");
      } catch {
        setError("Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [dietary, lifestyle, interests, router]
  );

  if (initialLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface font-montserrat text-on-surface-variant">
        Loading…
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh overflow-hidden font-montserrat">
      <CinematicBackground />
      {/* Back button */}
<button
  type="button"
  onClick={() => router.push("/onboarding/profile")}
  className="absolute left-6 top-6 z-20 flex items-center gap-1.5 font-montserrat text-sm font-semibold text-on-surface-variant/70 transition-colors hover:text-primary"
  aria-label="Go back to profile"
>
  <span className="material-symbols-outlined text-[20px]">arrow_back</span>
  Back
</button>

      <main className="relative z-10 flex min-h-dvh flex-col items-center px-6 py-10">
        <div className="w-full max-w-[500px] animate-soft-rise mt-1">
          <header className="mb-10 w-full text-center">
            <h1 className="mb-2 font-playfair text-[28px] font-semibold leading-tight text-primary md:text-[32px]">
              Tell us what you love.
            </h1>
            <p className="mx-auto max-w-[320px] font-montserrat text-base leading-relaxed text-on-surface-variant">
              Let&apos;s tailor your experience to match your unique lifestyle
              and taste.
            </p>
          </header>

          <StitchGlassPanel shimmer className="space-y-10 pb-12">
            <StitchChipGroup
              icon="restaurant"
              label="Dietary"
              options={DIETARY_OPTIONS}
              selected={dietary}
              onChange={setDietary}
            />
            <div className="mt-6">
              <StitchChipGroup
                icon="auto_awesome"
                label="Lifestyle"
                options={LIFESTYLE_OPTIONS}
                selected={lifestyle}
                onChange={setLifestyle}
              />
            </div>
            <div className="mt-6">
              <StitchChipGroup
                icon="favorite"
                label="Interests"
                options={INTEREST_OPTIONS}
                selected={interests}
                onChange={setInterests}
              />
            </div>

            <footer className="flex w-full flex-col items-center pt-4">
              <PremiumButton
                className={cn(
                  hasSelection ? "shadow-[0_15px_30px_-5px_rgba(139,78,60,0.35)]" : ""
                )}
                disabled={!hasSelection || loading}
                onClick={() => void save(false)}
              >
                {loading ? "Saving…" : "Continue"}
              </PremiumButton>
              <button
                type="button"
                disabled={loading}
                onClick={() => void save(true)}
                className="mb-4 mt-4 font-montserrat text-sm font-semibold text-primary/70 transition-colors hover:text-primary"
              >
                I&apos;ll do this later
              </button>
              <ProgressDots activeStep={1} />
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
