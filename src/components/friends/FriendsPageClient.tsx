"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { WeatherInfo } from "@/lib/types/home";
import type { CompatibilityPayload, FriendSummary } from "@/lib/types/friends";
import { MOCK_WEATHER } from "@/lib/mock/homePlan";
import { friendHasNoSchedule } from "@/lib/friends/friendSchedule";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { BottomNav } from "@/components/home/BottomNav";
import { AddFriendButton } from "./AddFriendButton";
import { AddFriendModal } from "./AddFriendModal";
import { FriendsEmptyState } from "./FriendsEmptyState";
import { FriendsHeader } from "./FriendsHeader";
import { CompatibilitySheet } from "./CompatibilitySheet";
import { ExpensesSheet } from "./ExpensesSheet";
import { FriendsList } from "./FriendsList";

export function FriendsPageClient({
  userName,
  profileImageUrl,
  weather = MOCK_WEATHER,
}: {
  userName: string;
  profileImageUrl?: string | null;
  weather?: WeatherInfo;
}) {
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [planSheetOpen, setPlanSheetOpen] = useState(false);
  const [planFriendId, setPlanFriendId] = useState<string | null>(null);
  const [compatibility, setCompatibility] =
    useState<CompatibilityPayload | null>(null);
  const [compatLoading, setCompatLoading] = useState(false);
  const [compatError, setCompatError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [expensesOpen, setExpensesOpen] = useState(false);
  const [expensesFriend, setExpensesFriend] = useState<FriendSummary | null>(
    null
  );
  const router = useRouter();

  const loadFriends = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/friends");
      const data = await res.json();

      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Could not load friends"
        );
        return;
      }

      setFriends(data.friends ?? []);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFriends();
  }, [loadFriends]);

  const handleFriendAdded = useCallback((friend: FriendSummary) => {
    setFriends((prev) => {
      const exists = prev.some((f) => f.id === friend.id);
      if (exists) {
        return prev.map((f) => (f.id === friend.id ? friend : f));
      }
      return [friend, ...prev];
    });
  }, []);

  const openAddModal = () => setAddModalOpen(true);

  const openLetsPlan = useCallback(async (friend: FriendSummary) => {
    if (friendHasNoSchedule(friend)) return;

    setPlanFriendId(friend.id);
    setPlanSheetOpen(true);
    setCompatibility(null);
    setCompatError(null);
    setCompatLoading(true);

    try {
      const res = await fetch(`/api/friends/${friend.id}/compatibility`);
      const data = await res.json();

      if (!res.ok) {
        setCompatError(
          typeof data.error === "string"
            ? data.error
            : "Could not load compatibility"
        );
        return;
      }

      setCompatibility(data.compatibility ?? null);
    } catch {
      setCompatError("Something went wrong. Please try again.");
    } finally {
      setCompatLoading(false);
    }
  }, []);

  const closePlanSheet = () => {
    setPlanSheetOpen(false);
    setPlanFriendId(null);
    setCompatibility(null);
    setCompatError(null);
  };

  const openViewSharedPlans = useCallback(
    (friend: FriendSummary) => {
      if (friendHasNoSchedule(friend)) return;
      router.push(`/friends/${friend.id}/plans`);
    },
    [router]
  );

  const openExpenses = useCallback((friend: FriendSummary) => {
    if (friendHasNoSchedule(friend)) return;
    setExpensesFriend(friend);
    setExpensesOpen(true);
  }, []);

  const closeExpenses = () => {
    setExpensesOpen(false);
    setExpensesFriend(null);
  };

  const handleRemoveFriend = useCallback(
    async (friend: FriendSummary) => {
      const name = friend.displayName?.trim() || "this friend";
      if (
        !window.confirm(
          `Remove ${name} from your circle? Shared expenses and plans between you will be deleted.`
        )
      ) {
        return;
      }

      setRemovingId(friend.id);
      try {
        const res = await fetch(`/api/friends/${friend.id}`, {
          method: "DELETE",
        });
        const data = await res.json();

        if (!res.ok) {
          setError(
            typeof data.error === "string"
              ? data.error
              : "Could not remove friend"
          );
          return;
        }

        setFriends((prev) => prev.filter((f) => f.id !== friend.id));
        if (planFriendId === friend.id) {
          closePlanSheet();
        }
        if (expensesFriend?.id === friend.id) {
          closeExpenses();
        }
      } catch {
        setError("Something went wrong. Please try again.");
      } finally {
        setRemovingId(null);
      }
    },
    [planFriendId, expensesFriend?.id]
  );

  return (
    <AuroraBackground variant="sanctuary">
      <FriendsHeader
        userName={userName}
        weather={weather}
        profileImageUrl={profileImageUrl}
      />

      <main className="relative z-10 mx-auto max-w-[600px] px-6 pb-32 pt-28">
        <AddFriendButton onClick={openAddModal} />

        <section className="mb-10 mt-6 text-center">
          <h2 className="font-playfair text-2xl font-semibold text-primary">
            Your Circle
          </h2>
          <p className="mt-1 font-montserrat text-sm italic text-on-surface-variant/80">
            These are the people your energy aligns with.
          </p>
        </section>

        {loading && (
          <p className="text-center font-montserrat text-sm text-on-surface-variant/70">
            Loading your circle…
          </p>
        )}

        {error && !loading && (
          <div className="glass-panel silk-border mb-6 rounded-2xl p-4 text-center">
            <p className="font-montserrat text-sm text-error">{error}</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                void loadFriends();
              }}
              className="mt-3 font-montserrat text-xs font-semibold uppercase tracking-wider text-primary"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && friends.length === 0 && (
          <FriendsEmptyState onAddFriend={openAddModal} />
        )}

        {!loading && friends.length > 0 && (
          <FriendsList
            friends={friends}
            onLetsPlan={openLetsPlan}
            onViewSharedPlans={openViewSharedPlans}
            onExpenses={openExpenses}
            onRemove={handleRemoveFriend}
            removingId={removingId}
          />
        )}
      </main>

      <BottomNav activeTab="friends" />

      <AddFriendModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onFriendAdded={handleFriendAdded}
      />

      <CompatibilitySheet
        open={planSheetOpen}
        onClose={closePlanSheet}
        loading={compatLoading}
        error={compatError}
        compatibility={compatibility}
        friendId={planFriendId}
      />

      <ExpensesSheet
        open={expensesOpen}
        onClose={closeExpenses}
        friendId={expensesFriend?.id ?? null}
        friendDisplayName={expensesFriend?.displayName ?? null}
      />
    </AuroraBackground>
  );
}
