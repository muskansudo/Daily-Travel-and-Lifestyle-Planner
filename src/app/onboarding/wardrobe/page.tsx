"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CinematicBackground } from "@/components/onboarding/CinematicBackground";
import { StitchGlassPanel } from "@/components/onboarding/StitchGlassPanel";
import { WardrobeUploader } from "@/components/onboarding/WardrobeUploader";
import { PremiumButton } from "@/components/ui/PremiumButton";
import type { WardrobeItemDTO } from "@/lib/types/wardrobe";
import { cn } from "@/lib/utils/cn";

// Matches the inline ProgressDots Muskan uses in preferences/page.tsx — kept
// inline rather than extracted because spec lives only across these 4 pages.
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

export default function WardrobeOnboardingPage() {
  const router = useRouter();
  const [items, setItems] = useState<WardrobeItemDTO[]>([]);
  const [uploading, setUploading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/onboarding/wardrobe")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.items)) setItems(data.items);
        if (data.onboardingWardrobeComplete) {
          router.replace("/home");
        }
      })
      .finally(() => setInitialLoading(false));
  }, [router]);

  const finish = useCallback(
    async (skip: boolean) => {
      setError(null);
      setLoading(true);

      try {
        const res = await fetch("/api/onboarding/wardrobe", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skip }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(
            typeof data.error === "string"
              ? data.error
              : "Could not finish onboarding"
          );
          return;
        }

        router.push(data.nextPath ?? "/home");
      } catch {
        setError("Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [router]
  );

  if (initialLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface font-montserrat text-on-surface-variant">
        Loading…
      </div>
    );
  }

  const hasItems = items.length > 0;
  const canContinue = hasItems && !uploading && !loading;

  return (
    <div className="relative min-h-dvh overflow-hidden font-montserrat">
      <CinematicBackground />
{/* Back button */}
<button
  type="button"
  onClick={() => router.push("/onboarding/calendar")}
  className="absolute left-6 top-6 z-20 flex items-center gap-1.5 font-montserrat text-sm font-semibold text-on-surface-variant/70 transition-colors hover:text-primary"
  aria-label="Go back to calendar"
>
  <span className="material-symbols-outlined text-[20px]">arrow_back</span>
  Back
</button>
      <main className="relative z-10 flex min-h-dvh flex-col items-center px-6 py-10">
        <div className="mt-1 w-full max-w-[540px] animate-soft-rise">
          <header className="mb-10 w-full text-center">
            <h1 className="mb-2 font-playfair text-[28px] font-semibold leading-tight text-primary md:text-[32px]">
              Curate your wardrobe.
            </h1>
            <p className="mx-auto max-w-[340px] font-montserrat text-base leading-relaxed text-on-surface-variant">
              Drop in a few pieces you love. We&apos;ll tag each one so your
              daily outfits feel effortless.
            </p>
          </header>

          <StitchGlassPanel className="space-y-8 pb-10">
            <WardrobeUploader
              items={items}
              onItemsChange={setItems}
              onUploadingChange={setUploading}
            />

            <footer className="flex w-full flex-col items-center pt-2">
              <PremiumButton
                className={cn(
                  canContinue
                    ? "shadow-[0_15px_30px_-5px_rgba(139,78,60,0.35)]"
                    : ""
                )}
                disabled={!canContinue}
                onClick={() => void finish(false)}
              >
                {loading ? "Finishing…" : "Finish onboarding"}
              </PremiumButton>
              <button
                type="button"
                disabled={loading || uploading}
                onClick={() => void finish(true)}
                className="mb-4 mt-4 font-montserrat text-sm font-semibold text-primary/70 transition-colors hover:text-primary"
              >
                I&apos;ll do this later
              </button>
              <ProgressDots activeStep={3} />
              {error && (
                <p
                  className="mt-4 font-montserrat text-sm text-error"
                  role="alert"
                >
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
