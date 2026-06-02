"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FriendSearchResult, FriendSummary } from "@/lib/types/friends";
import { backdropVariants, scaleIn } from "@/components/home/animations";
import { FriendAvatar } from "./FriendAvatar";
import { cn } from "@/lib/utils/cn";

export function AddFriendModal({
  open,
  onClose,
  onFriendAdded,
}: {
  open: boolean;
  onClose: () => void;
  onFriendAdded: (friend: FriendSummary) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FriendSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    setQuery("");
    setResults([]);
    setError(null);
    setSearching(false);
    setAddingId(null);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }

    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (trimmed.length < 1) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/friends/search?q=${encodeURIComponent(trimmed)}`
        );
        const data = await res.json();

        if (!res.ok) {
          setError(
            typeof data.error === "string"
              ? data.error
              : "Could not search users"
          );
          setResults([]);
          return;
        }

        setError(null);
        setResults(data.results ?? []);
      } catch {
        setError("Something went wrong. Please try again.");
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  const addFriend = async (userId: string) => {
    setAddingId(userId);
    setError(null);

    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendUserId: userId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "Could not add friend"
        );
        return;
      }

      if (data.friend) {
        onFriendAdded(data.friend as FriendSummary);
        onClose();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setAddingId(null);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-6"
          initial="hidden"
          animate="visible"
          exit="hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-friend-title"
        >
          <motion.button
            type="button"
            variants={backdropVariants}
            className="absolute inset-0 bg-surface-dim/20 backdrop-blur-md"
            aria-label="Close"
            onClick={onClose}
          />

          <motion.div
            variants={scaleIn}
            className="glass-panel silk-border relative z-10 flex max-h-[min(640px,85vh)] w-full max-w-[520px] flex-col overflow-hidden rounded-3xl shadow-[0_20px_40px_rgba(139,78,60,0.15)]"
          >
            <div className="h-px w-full bg-gradient-to-r from-transparent via-white/60 to-transparent" />

            <div className="flex flex-1 flex-col overflow-hidden p-6 sm:p-8">
              <div className="mb-8 text-center">
                <h2
                  id="add-friend-title"
                  className="font-playfair text-[28px] font-semibold tracking-tight text-primary sm:text-[32px]"
                >
                  Add a Friend
                </h2>
                <p className="mt-2 font-montserrat text-sm text-on-surface-variant/70">
                  Bring meaningful people into your circle.
                </p>
              </div>

              <div className="relative mb-6">
                <span className="pointer-events-none absolute inset-y-0 left-5 flex items-center text-on-surface-variant/50">
                  <span className="material-symbols-outlined">search</span>
                </span>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by display name…"
                  autoFocus
                  className="w-full rounded-full border border-white/40 bg-white/30 py-4 pl-14 pr-6 font-montserrat text-base text-on-surface shadow-inner backdrop-blur-md placeholder:text-on-surface-variant/40 focus:bg-white/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="min-h-[120px] flex-1 overflow-y-auto">
                {error && (
                  <p className="mb-3 text-center font-montserrat text-sm text-error">
                    {error}
                  </p>
                )}

                {searching && query.trim().length > 0 && (
                  <p className="text-center font-montserrat text-sm italic text-on-surface-variant/50">
                    Searching for &ldquo;{query.trim()}&rdquo;&hellip;
                  </p>
                )}

                {!searching && query.trim().length > 0 && results.length === 0 && (
                  <p className="text-center font-montserrat text-sm text-on-surface-variant/60">
                    No one found with that name.
                  </p>
                )}

                <ul className="flex flex-col gap-2 p-0">
                  {results.map((result) => {
                    const isAdding = addingId === result.id;
                    const name = result.displayName?.trim() || "User";

                    return (
                      <li key={result.id} className="list-none">
                        <button
                          type="button"
                          disabled={addingId !== null}
                          onClick={() => addFriend(result.id)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-2xl border border-white/40 bg-white/30 p-3 text-left transition-all hover:bg-white/50",
                            isAdding && "opacity-70"
                          )}
                        >
                          <FriendAvatar
                            displayName={result.displayName}
                            profilePhotoUrl={result.profilePhotoUrl}
                            size="sm"
                          />
                          <span className="flex-1 font-montserrat text-base font-medium text-on-surface">
                            {name}
                          </span>
                          <span className="font-montserrat text-xs font-semibold uppercase tracking-wider text-primary">
                            {isAdding ? "Adding…" : "Add"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="mt-6 flex justify-center pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex items-center gap-2 font-montserrat text-sm font-semibold text-on-surface-variant/60 transition-colors hover:text-primary"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                  Dismiss
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
