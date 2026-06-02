import type {
  ExpenseBalance,
  FriendExpenseDTO,
  FriendExpenseRow,
} from "@/lib/types/friends";

/** INR → paise (integer). */
export function inrToPaise(amountInr: number): number {
  return Math.round(amountInr * 100);
}

export function paiseToInr(paise: number): number {
  return paise / 100;
}

function formatInr(paise: number): string {
  const inr = paiseToInr(Math.abs(paise));
  const formatted =
    inr % 1 === 0
      ? inr.toLocaleString("en-IN", { maximumFractionDigits: 0 })
      : inr.toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
  return `₹${formatted}`;
}

/**
 * Net balance from current user's perspective (unsettled, equal split, 2 people).
 * Positive net → friend owes current user.
 */
export function computeNetBalancePaise(
  expenses: FriendExpenseRow[],
  currentUserId: string,
  friendDisplayName: string
): ExpenseBalance {
  let netPaise = 0;

  for (const expense of expenses) {
    if (expense.settled_at) continue;

    const share = Math.floor(expense.amount_paise / 2);
    if (expense.paid_by_user_id === currentUserId) {
      netPaise += share;
    } else {
      netPaise -= share;
    }
  }

  const name = friendDisplayName?.trim() || "Friend";

  if (netPaise === 0) {
    return { netPaise: 0, label: "All settled up" };
  }

  if (netPaise > 0) {
    return {
      netPaise,
      label: `${name} owes You ${formatInr(netPaise)}`,
    };
  }

  return {
    netPaise,
    label: `You owe ${name} ${formatInr(netPaise)}`,
  };
}

export function expenseOweLabel(
  expense: FriendExpenseRow,
  currentUserId: string,
  friendDisplayName: string
): string {
  const share = Math.floor(expense.amount_paise / 2);
  const name = friendDisplayName?.trim() || "Friend";
  const amount = formatInr(share);

  if (expense.settled_at) {
    return "Settled";
  }

  if (expense.paid_by_user_id === currentUserId) {
    return `${name} owes ${amount}`;
  }

  return `You owe ${name} ${amount}`;
}

export function toExpenseDTO(
  expense: FriendExpenseRow,
  currentUserId: string,
  friendDisplayName: string
): FriendExpenseDTO {
  return {
    id: expense.id,
    description: expense.description,
    place: expense.place,
    amountInr: paiseToInr(expense.amount_paise),
    paidByUserId: expense.paid_by_user_id,
    paidByMe: expense.paid_by_user_id === currentUserId,
    splitMode: "equal",
    settled: expense.settled_at !== null,
    settledAt: expense.settled_at,
    createdAt: expense.created_at,
    oweLabel: expenseOweLabel(expense, currentUserId, friendDisplayName),
  };
}
