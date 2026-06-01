"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import type {
  ExpenseBalance,
  FriendExpenseDTO,
  FriendExpensesResponse,
} from "@/lib/types/friends";
import { backdropVariants, sheetVariants } from "@/components/home/animations";
import { cn } from "@/lib/utils/cn";

function formatExpenseDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) {
    return date.toLocaleDateString("en-IN", { weekday: "long" });
  }

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

function ExpenseRow({
  expense,
  friendName,
  settling,
  onSettle,
}: {
  expense: FriendExpenseDTO;
  friendName: string;
  settling: boolean;
  onSettle: (expense: FriendExpenseDTO) => void;
}) {
  const subtitle = expense.place?.trim()
    ? `${expense.place} · `
    : "";
  const paidLabel = expense.paidByMe ? "Paid by You" : `Paid by ${friendName}`;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-2xl border border-white/60 bg-white/40 p-4 shadow-sm",
        expense.settled && "opacity-70"
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary-fixed/30 text-primary">
          <span className="material-symbols-outlined text-[20px]">
            payments
          </span>
        </div>
        <div className="min-w-0">
          <p className="truncate font-montserrat text-[13px] font-semibold text-on-surface">
            {expense.description}
          </p>
          <p className="font-montserrat text-[10px] text-on-surface-variant/60">
            {subtitle}
            {paidLabel} · Equal split
          </p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p
          className={cn(
            "font-montserrat text-[13px] font-medium uppercase",
            expense.settled
              ? "text-on-surface-variant/50"
              : "text-green-700/80"
          )}
        >
          {expense.oweLabel}
        </p>
        <p className="font-montserrat text-[9px] uppercase tracking-tighter text-on-surface-variant/40">
          {formatExpenseDate(expense.createdAt)}
        </p>
        {!expense.settled && (
          <button
            type="button"
            disabled={settling}
            onClick={() => onSettle(expense)}
            className="mt-1.5 font-montserrat text-[10px] font-semibold uppercase tracking-wider text-primary disabled:opacity-50"
          >
            {settling ? "Settling…" : "Settle"}
          </button>
        )}
      </div>
    </div>
  );
}

export function ExpensesSheet({
  open,
  onClose,
  friendId,
  friendDisplayName,
}: {
  open: boolean;
  onClose: () => void;
  friendId: string | null;
  friendDisplayName: string | null;
}) {
  const name = friendDisplayName?.trim() || "Friend";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<FriendExpenseDTO[]>([]);
  const [balance, setBalance] = useState<ExpenseBalance | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [settlingId, setSettlingId] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [place, setPlace] = useState("");
  const [amountInr, setAmountInr] = useState("");
  const [paidBy, setPaidBy] = useState<"me" | "friend">("me");

  const applyPayload = useCallback((data: FriendExpensesResponse) => {
    setExpenses(data.expenses ?? []);
    setBalance(data.balance ?? null);
  }, []);

  const loadExpenses = useCallback(async () => {
    if (!friendId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/friends/${friendId}/expenses`);
      const data = (await res.json()) as FriendExpensesResponse & {
        error?: string;
      };

      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Could not load expenses"
        );
        return;
      }

      applyPayload(data);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [friendId, applyPayload]);

  useEffect(() => {
    if (!open || !friendId) return;
    document.body.style.overflow = "hidden";
    setShowAddForm(false);
    setDescription("");
    setPlace("");
    setAmountInr("");
    setPaidBy("me");
    void loadExpenses();

    return () => {
      document.body.style.overflow = "";
    };
  }, [open, friendId, loadExpenses]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendId) return;

    const amount = Number.parseFloat(amountInr);
    if (!description.trim() || !Number.isFinite(amount) || amount <= 0) {
      setError("Enter a description and a valid amount.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/friends/${friendId}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          place: place.trim() || undefined,
          amountInr: amount,
          paidBy,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Could not add expense"
        );
        return;
      }

      applyPayload(data);
      setShowAddForm(false);
      setDescription("");
      setPlace("");
      setAmountInr("");
      setPaidBy("me");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSettle = async (expense: FriendExpenseDTO) => {
    if (!friendId || expense.settled) return;

    setSettlingId(expense.id);
    setError(null);

    try {
      const res = await fetch(
        `/api/friends/${friendId}/expenses/${expense.id}/settle`,
        { method: "PATCH" }
      );
      const data = await res.json();

      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Could not settle expense"
        );
        return;
      }

      if (data.expenses && data.balance) {
        applyPayload(data);
      } else if (data.expense) {
        setExpenses((prev) =>
          prev.map((row) => (row.id === data.expense.id ? data.expense : row))
        );
        if (data.balance) setBalance(data.balance);
      } else {
        void loadExpenses();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSettlingId(null);
    }
  };

  const balanceBanner =
    balance?.label ??
    (loading ? "Loading balance…" : "All settled up");

  return (
    <AnimatePresence>
      {open && friendId && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="expenses-sheet-title"
        >
          <motion.button
            type="button"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute inset-0 bg-black/5 backdrop-blur-sm"
            aria-label="Close"
            onClick={onClose}
          />

          <motion.div
            variants={sheetVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="glass-panel silk-border relative z-10 max-h-[min(85vh,640px)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-t-[2.5rem] rounded-b-none p-5 pb-8"
          >
            <div className="mx-auto mb-5 h-1 w-12 rounded-full bg-primary/20" />

            <div className="mb-4 flex items-center justify-between gap-3">
              <h3
                id="expenses-sheet-title"
                className="font-playfair text-lg font-semibold text-on-surface-variant"
              >
                Settlements with {name}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddForm((v) => !v)}
                className="shrink-0 border-b border-primary/20 font-montserrat text-[11px] font-medium uppercase text-primary"
              >
                {showAddForm ? "Cancel" : "+ Add expense"}
              </button>
            </div>

            {showAddForm && (
              <form
                onSubmit={handleAddExpense}
                className="mb-6 space-y-3 rounded-2xl border border-white/50 bg-white/35 p-4"
              >
                <div>
                  <label className="mb-1 block font-montserrat text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/70">
                    Description
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Blue Tokai Coffee"
                    className="w-full rounded-xl border border-white/60 bg-white/50 px-3 py-2 font-montserrat text-sm text-on-surface outline-none focus:border-primary/40"
                    maxLength={200}
                  />
                </div>
                <div>
                  <label className="mb-1 block font-montserrat text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/70">
                    Place (optional)
                  </label>
                  <input
                    type="text"
                    value={place}
                    onChange={(e) => setPlace(e.target.value)}
                    placeholder="e.g. Koramangala"
                    className="w-full rounded-xl border border-white/60 bg-white/50 px-3 py-2 font-montserrat text-sm text-on-surface outline-none focus:border-primary/40"
                    maxLength={200}
                  />
                </div>
                <div>
                  <label className="mb-1 block font-montserrat text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/70">
                    Amount (₹)
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    value={amountInr}
                    onChange={(e) => setAmountInr(e.target.value)}
                    placeholder="700"
                    className="w-full rounded-xl border border-white/60 bg-white/50 px-3 py-2 font-montserrat text-sm text-on-surface outline-none focus:border-primary/40"
                  />
                </div>
                <div>
                  <p className="mb-2 font-montserrat text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/70">
                    Paid by
                  </p>
                  <div className="flex gap-2">
                    {(["me", "friend"] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setPaidBy(option)}
                        className={cn(
                          "flex-1 rounded-full border py-2 font-montserrat text-xs font-semibold uppercase tracking-wider transition-colors",
                          paidBy === option
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-white/60 bg-white/40 text-on-surface-variant/70"
                        )}
                      >
                        {option === "me" ? "Me" : name}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 font-montserrat text-[10px] text-on-surface-variant/50">
                    Split equally between you two.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-premium w-full rounded-full py-3 font-montserrat text-xs font-bold uppercase tracking-[0.2em] disabled:opacity-60"
                >
                  {submitting ? "Saving…" : "Save expense"}
                </button>
              </form>
            )}

            {error && (
              <p className="mb-4 text-center font-montserrat text-sm text-error">
                {error}
              </p>
            )}

            {loading && (
              <p className="py-8 text-center font-montserrat text-sm text-on-surface-variant/70">
                Loading expenses…
              </p>
            )}

            {!loading && (
              <>
                <div className="mb-4 rounded-2xl border border-primary/10 bg-primary/5 p-4">
                  <span className="font-montserrat text-[12px] font-medium uppercase text-text-on-surface/60">
                    Total balance
                  </span>
                  <p className="mt-1 font-playfair text-lg font-semibold text-primary">
                    {balanceBanner}
                  </p>
                </div>

                {expenses.length === 0 ? (
                  <p className="py-6 text-center font-montserrat text-sm text-on-surface-variant/60">
                    No expenses yet. Add one to start tracking splits.
                  </p>
                ) : (
                  <ul className="space-y-3 p-0">
                    {expenses.map((expense) => (
                      <li key={expense.id} className="list-none">
                        <ExpenseRow
                          expense={expense}
                          friendName={name}
                          settling={settlingId === expense.id}
                          onSettle={handleSettle}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
