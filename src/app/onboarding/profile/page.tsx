"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CinematicBackground } from "@/components/onboarding/CinematicBackground";
import { ProfilePhotoPicker } from "@/components/onboarding/ProfilePhotoPicker";
import { StitchGlassPanel } from "@/components/onboarding/StitchGlassPanel";
import { PremiumButton } from "@/components/ui/PremiumButton";

export default function ProfileOnboardingPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    fetch("/api/onboarding/profile")
      .then((r) => r.json())
      .then((data) => {
  if (data.displayName) setDisplayName(data.displayName);
  if (data.profilePhotoUrl) setProfilePhotoUrl(data.profilePhotoUrl);
  // Removed auto-redirect so Back button works
})
      .finally(() => setInitialLoading(false));
  }, [router]);

  const save = useCallback(
    async (skip: boolean) => {
      setError(null);
      setLoading(true);

      try {
        const res = await fetch("/api/onboarding/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: displayName.trim(),
            profilePhotoUrl,
            skip,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          const msg =
            typeof data.error === "string"
              ? data.error
              : data.error?.displayName?.[0] ?? "Could not save profile";
          setError(msg);
          return;
        }

        router.push(data.nextPath ?? "/onboarding/preferences");
      } catch {
        setError("Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [displayName, profilePhotoUrl, router]
  );

  if (initialLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface font-montserrat text-on-surface-variant">
        Loading…
      </div>
    );
  }

  const canContinue = displayName.trim().length > 0 && !uploadingPhoto;

  return (
    <div className="relative min-h-dvh overflow-hidden font-montserrat">
      <CinematicBackground />

      <main className="relative z-10 flex min-h-dvh items-center justify-center p-6">
        <StitchGlassPanel className="max-w-[480px] animate-soft-rise text-center">
          <header className="mb-10 space-y-2">
            <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/50 bg-primary/10">
              <span className="material-symbols-outlined text-[24px] text-primary">
                auto_awesome
              </span>
            </div>
            <h1 className="font-playfair text-[40px] font-bold leading-[1.1] tracking-tight text-on-surface">
              What Should We Call You?
            </h1>
            <p className="mx-auto mt-2 max-w-[340px] font-montserrat text-lg leading-relaxed text-on-surface-variant/70">
              How should I address you as we curate your days?
            </p>
          </header>

          <div className="mb-10 w-full space-y-4">
            <input
              className="input-minimal"
              placeholder="Enter your name..."
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={50}
              autoComplete="nickname"
              aria-label="Preferred name"
            />
            <p className="font-montserrat text-[10px] font-semibold uppercase tracking-[0.2em] text-on-surface-variant/70">
              Your preferred name
            </p>
          </div>

          <div className="mb-10">
            <ProfilePhotoPicker
              value={profilePhotoUrl}
              onChange={setProfilePhotoUrl}
              onUploadingChange={setUploadingPhoto}
            />
          </div>

          <footer className="w-full space-y-4">
            <PremiumButton
              disabled={!canContinue || loading}
              onClick={() => void save(false)}
            >
              {loading ? "Saving…" : "Let's Begin"}
            </PremiumButton>
            <button
              type="button"
              disabled={loading || uploadingPhoto}
              onClick={() => void save(true)}
              className="font-montserrat text-sm font-semibold uppercase tracking-wider text-on-surface-variant transition-colors hover:text-primary"
            >
              Skip for now
            </button>
            {error && (
              <p className="font-montserrat text-sm text-error" role="alert">
                {error}
              </p>
            )}
          </footer>
        </StitchGlassPanel>
      </main>
    </div>
  );
}
