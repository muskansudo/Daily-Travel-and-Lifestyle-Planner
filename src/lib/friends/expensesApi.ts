import {
  computeNetBalancePaise,
  toExpenseDTO,
} from "@/lib/friends/balance";
import { canonicalFriendPair } from "@/lib/friends/pair";
import type {
  ExpenseBalance,
  FriendExpenseDTO,
  FriendExpenseRow,
} from "@/lib/types/friends";
import { createAdminClient } from "@/lib/supabase/admin";

export async function fetchFriendExpenseRows(
  currentUserId: string,
  friendUserId: string
): Promise<FriendExpenseRow[]> {
  const [userLowId, userHighId] = canonicalFriendPair(
    currentUserId,
    friendUserId
  );
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("friend_expenses")
    .select(
      "id, user_low_id, user_high_id, description, place, amount_paise, paid_by_user_id, split_mode, settled_at, created_at"
    )
    .eq("user_low_id", userLowId)
    .eq("user_high_id", userHighId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as FriendExpenseRow[];
}

export function buildExpensesPayload(
  rows: FriendExpenseRow[],
  currentUserId: string,
  friendDisplayName: string | null
): { expenses: FriendExpenseDTO[]; balance: ExpenseBalance } {
  const name = friendDisplayName?.trim() || "Friend";
  const expenses = rows.map((row) =>
    toExpenseDTO(row, currentUserId, name)
  );
  const balance = computeNetBalancePaise(rows, currentUserId, name);

  return { expenses, balance };
}
