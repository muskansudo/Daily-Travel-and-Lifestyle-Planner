"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, LayoutGroup } from "framer-motion";
import type { CollabPlanGenerateResponse } from "@/lib/types/friends";
import {
  buildCollabTimeline,
  canSaveCollabPlan,
  collabStopsToVenues,
  countEmptyCollabWindows,
  isNoSharedWindows,
} from "@/lib/friends/collabPlanDisplay";
import { generateResponseToPayload } from "@/lib/friends/collabPayload";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { PremiumButton } from "@/components/ui/PremiumButton";
import {
  CollabPlanGenerationFrame,
  type CollabGenerationProfile,
} from "@/components/friends/CollabPlanGenerationFrame";
import { PlanTimeline } from "@/components/home/PlanTimeline";
import { VenueCarousel } from "@/components/home/VenueCarousel";
import { EnergyAlignmentBadge } from "@/components/friends/EnergyAlignmentBadge";
import { energyAlignmentTier } from "@/lib/friends/alignment";
import { staggerContainer, staggerItem } from "@/components/home/animations";
import type { TimelineItem } from "@/lib/types/home";
import type { VenueRecommendation } from "@/lib/types/home";

type PageState = "initial" | "generating" | "generated";

function CollabStatusBanner({
  response,
}: {
  response: CollabPlanGenerateResponse;
}) {
  if (isNoSharedWindows(response)) {
    return (
      <div className="glass-panel silk-border rounded-2xl p-6 text-center">
        <p className="font-playfair text-lg text-on-surface">
          No shared free time today
        </p>
        <p className="mt-2 font-montserrat text-sm text-on-surface-variant/80">
          Add manual schedules on Home or connect calendars, then check
          compatibility again.
        </p>
      </div>
    );
  }

  const emptyWindows = countEmptyCollabWindows(response);
  if (emptyWindows > 0) {
    return (
      <div className="glass-panel silk-border rounded-2xl p-4 text-center">
        <p className="font-montserrat text-sm text-on-surface-variant">
          {emptyWindows === 1
            ? "One shared window had no venue matches."
            : `${emptyWindows} shared windows had no venue matches.`}
        </p>
      </div>
    );
  }

  if (response.debug.cappedAt) {
    return (
      <div className="glass-panel silk-border rounded-2xl p-4 text-center">
        <p className="font-montserrat text-sm text-on-surface-variant">
          Planned the first {response.debug.cappedAt} windows — open again
          tomorrow for more.
        </p>
      </div>
    );
  }

  return null;
}

export function CollabPlanPageClient({ friendId }: { friendId: string }) {
  const router = useRouter();
  const [pageState, setPageState] = useState<PageState>("initial");
  const [error, setError] = useState<string | null>(null);
  const [apiReady, setApiReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [venues, setVenues] = useState<VenueRecommendation[]>([]);
  const [friendName, setFriendName] = useState("your friend");
  const [energyPercent, setEnergyPercent] = useState(0);
  const [interestLabels, setInterestLabels] = useState<string[]>([]);
  const [meProfile, setMeProfile] = useState<CollabGenerationProfile>({
    displayName: null,
    profilePhotoUrl: null,
  });
  const [friendProfile, setFriendProfile] = useState<CollabGenerationProfile>({
    displayName: null,
    profilePhotoUrl: null,
  });

  const responseRef = useRef<CollabPlanGenerateResponse | null>(null);
  const generateStarted = useRef(false);

  const runGenerate = useCallback(async () => {
    setError(null);
    setApiReady(false);
    setPageState("generating");

    try {
      const res = await fetch(`/api/friends/${friendId}/plans/generate`, {
        method: "POST",
      });
      const data = (await res.json()) as CollabPlanGenerateResponse & {
        error?: string;
      };

      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Generation failed"
        );
      }

      responseRef.current = data;
      setFriendName(data.compatibility.friendDisplayName?.trim() || "your friend");
      setEnergyPercent(data.compatibility.energyAlignmentPercent);
      setInterestLabels(data.compatibility.sharedInterestLabels);
      setTimeline(buildCollabTimeline(data));
      setVenues(collabStopsToVenues(data.windows));
      setApiReady(true);
    } catch (e) {
      responseRef.current = null;
      setError(e instanceof Error ? e.message : "Something went wrong");
      setApiReady(true);
    }
  }, [friendId]);

  useEffect(() => {
    void Promise.all([
      fetch("/api/onboarding/profile")
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
      fetch("/api/friends")
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
    ]).then(([profileData, friendsData]) => {
      if (profileData && typeof profileData === "object") {
        const p = profileData as {
          displayName?: string | null;
          profilePhotoUrl?: string | null;
        };
        setMeProfile({
          displayName: p.displayName ?? null,
          profilePhotoUrl: p.profilePhotoUrl ?? null,
        });
      }
      if (friendsData && typeof friendsData === "object") {
        const list = (friendsData as { friends?: Array<{
          id: string;
          displayName: string | null;
          profilePhotoUrl: string | null;
        }> }).friends;
        const match = list?.find((f) => f.id === friendId);
        if (match) {
          setFriendProfile({
            displayName: match.displayName,
            profilePhotoUrl: match.profilePhotoUrl,
          });
        }
      }
    });
  }, [friendId]);

  useEffect(() => {
    if (generateStarted.current) return;
    generateStarted.current = true;
    void runGenerate();
  }, [runGenerate]);

  const handleGenerationComplete = useCallback(() => {
    if (error || !responseRef.current) {
      setPageState("initial");
      return;
    }
    setPageState("generated");
  }, [error]);

  const handleSave = async () => {
    const response = responseRef.current;
    if (!response || !canSaveCollabPlan(response)) return;

    setSaving(true);
    setError(null);

    try {
      const payload = generateResponseToPayload(response);

      const res = await fetch(`/api/friends/${friendId}/plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      });

      const data = (await res.json()) as {
        plan?: { id: string };
        error?: string | Record<string, unknown>;
      };

      if (!res.ok || !data.plan?.id) {
        const message =
          typeof data.error === "string"
            ? data.error
            : data.error && typeof data.error === "object"
              ? "Could not save — check your plan data and try again."
              : "Could not save plan";
        throw new Error(message);
      }

      router.push(`/friends/${friendId}/plans/${data.plan.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const response = responseRef.current;
  const canSave = response ? canSaveCollabPlan(response) : false;

  return (
    <AuroraBackground variant="sanctuary">
      <header className="fixed left-0 right-0 top-0 z-40 border-b border-white/10 bg-surface/40 backdrop-blur-xl">
        <div className="mx-auto flex max-w-md items-center justify-between px-6 py-3">
          <Link
            href="/friends"
            className="rounded-full p-2 text-primary transition-colors hover:bg-white/10"
            aria-label="Back to friends"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </Link>
          <h1 className="truncate px-2 font-playfair text-lg font-semibold text-primary">
            Plan with {friendName}
          </h1>
          <div className="w-10" aria-hidden />
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-md space-y-8 px-6 pb-32 pt-24">
        {pageState !== "generating" && (
          <div className="flex flex-col items-center gap-3">
            <EnergyAlignmentBadge
              percent={energyPercent}
              tier={energyAlignmentTier(energyPercent)}
            />
            {interestLabels.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5">
                {interestLabels.map((label) => (
                  <span
                    key={label}
                    className="rounded-full bg-white/40 px-2.5 py-0.5 font-montserrat text-[11px] text-on-surface/90"
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="glass-panel silk-border rounded-2xl p-4 text-center">
            <p className="font-montserrat text-sm text-error">{error}</p>
            {pageState === "initial" && (
              <button
                type="button"
                onClick={() => {
                  generateStarted.current = false;
                  void runGenerate();
                }}
                className="mt-3 font-montserrat text-xs font-semibold uppercase tracking-wider text-primary"
              >
                Try again
              </button>
            )}
          </div>
        )}

        <LayoutGroup>
          <AnimatePresence mode="wait">
            {pageState === "generating" && (
              <motion.div
                key="generating"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
              >
                <CollabPlanGenerationFrame
                  me={meProfile}
                  friend={friendProfile}
                  friendName={friendName}
                  ready={apiReady}
                  onComplete={handleGenerationComplete}
                />
              </motion.div>
            )}

            {pageState === "generated" && response && (
              <motion.div
                key="generated"
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                className="space-y-8"
              >
                <motion.div variants={staggerItem}>
                  <CollabStatusBanner response={response} />
                </motion.div>
                <motion.div variants={staggerItem}>
                  <PlanTimeline
                    items={timeline}
                    emptyMessage={
                      isNoSharedWindows(response)
                        ? "No shared free windows today"
                        : undefined
                    }
                  />
                </motion.div>
                {venues.length > 0 && (
                  <motion.div variants={staggerItem}>
                    <VenueCarousel venues={venues} />
                  </motion.div>
                )}
                <motion.div variants={staggerItem} className="space-y-3">
                  {canSave && (
                    <PremiumButton
                      type="button"
                      disabled={saving}
                      onClick={() => void handleSave()}
                    >
                      {saving ? "Saving…" : "Save proposal"}
                    </PremiumButton>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      generateStarted.current = true;
                      responseRef.current = null;
                      setPageState("generating");
                      void runGenerate();
                    }}
                    disabled={saving}
                    className="flex w-full items-center justify-center gap-2 rounded-full border border-white/60 bg-white/30 py-3.5 font-montserrat text-sm font-semibold uppercase tracking-wider text-primary backdrop-blur-md"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      refresh
                    </span>
                    Regenerate
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </LayoutGroup>
      </main>
    </AuroraBackground>
  );
}
