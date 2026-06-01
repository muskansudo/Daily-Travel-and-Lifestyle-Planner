"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { FriendPlansResponse, SharedPlanDetailDTO } from "@/lib/types/friends";
import { planNumbersByCreationOrder } from "@/lib/friends/planNumbers";
import {
  buildCollabTimelineFromPayload,
  collabStopsToVenues,
} from "@/lib/friends/collabPlanDisplay";
import { payloadWindowToPlanned } from "@/lib/friends/collabPlanDisplay";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { PlanTimeline } from "@/components/home/PlanTimeline";
import { VenueCarousel } from "@/components/home/VenueCarousel";
import { EnergyAlignmentBadge } from "@/components/friends/EnergyAlignmentBadge";
import { energyAlignmentTier } from "@/lib/friends/alignment";

export function SharedPlanDetailPageClient({
  friendId,
  planId,
}: {
  friendId: string;
  planId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<SharedPlanDetailDTO | null>(null);
  const [planNumber, setPlanNumber] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [detailRes, listRes] = await Promise.all([
        fetch(`/api/friends/${friendId}/plans/${planId}`),
        fetch(`/api/friends/${friendId}/plans`),
      ]);
      const data = (await detailRes.json()) as {
        plan?: SharedPlanDetailDTO;
        error?: string;
      };
      const listData = (await listRes.json()) as FriendPlansResponse;

      if (!detailRes.ok || !data.plan) {
        setError(
          typeof data.error === "string" ? data.error : "Could not load plan"
        );
        return;
      }

      setPlan(data.plan);
      if (listRes.ok && listData.plans) {
        const numbers = planNumbersByCreationOrder(listData.plans);
        setPlanNumber(numbers.get(planId) ?? null);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [friendId, planId]);

  useEffect(() => {
    void load();
  }, [load]);

  const friendName = plan?.friendDisplayName?.trim() || "your friend";
  const payload = plan?.planPayload;
  const windows = payload?.windows.map(payloadWindowToPlanned) ?? [];
  const timeline = payload ? buildCollabTimelineFromPayload(payload) : [];
  const venues = collabStopsToVenues(windows);
  const energyPercent = payload?.meta.energyAlignmentPercent ?? 0;

  return (
    <AuroraBackground variant="sanctuary">
      <header className="fixed left-0 right-0 top-0 z-40 border-b border-white/10 bg-surface/40 backdrop-blur-xl">
        <div className="mx-auto flex max-w-md items-center justify-between px-6 py-3">
          <Link
            href={`/friends/${friendId}/plans`}
            className="rounded-full p-2 text-primary transition-colors hover:bg-white/10"
            aria-label="Back to shared plans"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </Link>
          <h1 className="truncate px-2 font-playfair text-xl font-semibold text-primary sm:text-2xl">
            {planNumber != null ? `Plan #${planNumber}` : "Shared plan"}
          </h1>
          <div className="w-10" aria-hidden />
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-md space-y-8 px-6 pb-24 pt-24">
        <p className="text-center font-montserrat text-sm text-on-surface-variant/80">
          With {friendName}
        </p>

        {loading && (
          <p className="text-center font-montserrat text-sm text-on-surface-variant/70">
            Loading plan…
          </p>
        )}

        {error && !loading && (
          <div className="glass-panel silk-border rounded-2xl p-4 text-center">
            <p className="font-montserrat text-sm text-error">{error}</p>
          </div>
        )}

        {!loading && !error && payload && (
          <>
            <div className="flex flex-col items-center gap-3">
              <EnergyAlignmentBadge
                percent={energyPercent}
                tier={energyAlignmentTier(energyPercent)}
              />
              {payload.meta.sharedInterestLabels.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1.5">
                  {payload.meta.sharedInterestLabels.map((label) => (
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
            <PlanTimeline items={timeline} />
            {venues.length > 0 && <VenueCarousel venues={venues} />}
          </>
        )}
      </main>
    </AuroraBackground>
  );
}
