"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FriendPlansResponse, SharedPlanDTO } from "@/lib/types/friends";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { planNumbersByCreationOrder } from "@/lib/friends/planNumbers";
import { SharedPlansEmptyState } from "./SharedPlansEmptyState";
import { cn } from "@/lib/utils/cn";

export function SharedPlansPageClient({ friendId }: { friendId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [friendName, setFriendName] = useState("your friend");
  const [plans, setPlans] = useState<SharedPlanDTO[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const planNumbers = useMemo(() => planNumbersByCreationOrder(plans), [plans]);

  const loadPlans = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/friends/${friendId}/plans`);
      const data = (await res.json()) as FriendPlansResponse & {
        error?: string;
      };

      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Could not load shared plans"
        );
        return;
      }

      setFriendName(data.friendDisplayName?.trim() || "your friend");
      setPlans(data.plans ?? []);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [friendId]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const handleDelete = async (planId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (deletingId) return;

    setDeletingId(planId);
    setError(null);

    try {
      const res = await fetch(`/api/friends/${friendId}/plans/${planId}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Could not delete plan"
        );
        return;
      }

      setPlans((prev) => prev.filter((p) => p.id !== planId));
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

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
          <h1 className="truncate px-2 font-playfair text-xl font-semibold text-primary sm:text-2xl">
            Shared plans
          </h1>
          <div className="w-10" aria-hidden />
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-md px-6 pb-24 pt-24">
        <p className="mb-6 text-center font-montserrat text-sm text-on-surface-variant/80">
          With {friendName}
        </p>

        {loading && (
          <p className="text-center font-montserrat text-sm text-on-surface-variant/70">
            Loading plans…
          </p>
        )}

        {error && !loading && (
          <div className="glass-panel silk-border rounded-2xl p-4 text-center">
            <p className="font-montserrat text-sm text-error">{error}</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                void loadPlans();
              }}
              className="mt-3 font-montserrat text-xs font-semibold uppercase tracking-wider text-primary"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && plans.length === 0 && (
          <SharedPlansEmptyState
            friendName={friendName}
            onLetsPlan={() => router.push("/friends")}
          />
        )}

        {!loading && !error && plans.length > 0 && (
          <ul className="flex list-none flex-col gap-3 p-0">
            {plans.map((plan) => {
              const planNum = planNumbers.get(plan.id) ?? 0;
              const isDeleting = deletingId === plan.id;

              return (
                <li key={plan.id} className="list-none">
                  <Link
                    href={`/friends/${friendId}/plans/${plan.id}`}
                    className={cn(
                      "glass-panel silk-border relative block rounded-2xl p-4 pr-12 transition-colors hover:bg-white/20",
                      isDeleting && "pointer-events-none opacity-60"
                    )}
                  >
                    <button
                      type="button"
                      disabled={deletingId !== null}
                      onClick={(e) => void handleDelete(plan.id, e)}
                      className="absolute right-2 top-2 z-10 rounded-full p-1.5 text-on-surface-variant/45 transition-colors hover:bg-white/50 hover:text-error"
                      aria-label={`Delete plan ${planNum}`}
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        delete
                      </span>
                    </button>

                    <h3 className="font-playfair text-lg font-semibold text-on-surface">
                      Plan #{planNum}
                    </h3>
                    <p className="mt-1 font-montserrat text-[11px] uppercase tracking-wider text-on-surface-variant/60">
                      {plan.status}
                      {plan.windowCount != null && plan.windowCount > 0
                        ? ` · ${plan.windowCount} window${plan.windowCount === 1 ? "" : "s"}`
                        : ""}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </AuroraBackground>
  );
}
