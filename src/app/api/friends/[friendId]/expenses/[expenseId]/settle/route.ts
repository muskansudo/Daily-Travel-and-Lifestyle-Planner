import { NextResponse } from "next/server";
import { getOrCreateDbUser, getDbUserById, requireAuth } from "@/lib/auth";
import { FriendshipError, assertFriendship } from "@/lib/friends/assertFriendship";
import {
  buildExpensesPayload,
  fetchFriendExpenseRows,
} from "@/lib/friends/expensesApi";
import { canonicalFriendPair } from "@/lib/friends/pair";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  _request: Request,
  {
    params,
  }: { params: { friendId: string; expenseId: string } }
) {
  const clerkId = await requireAuth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const me = await getOrCreateDbUser(clerkId);
    const { friendId, expenseId } = params;

    await assertFriendship(me.id, friendId);

    const friend = await getDbUserById(friendId);
    if (!friend) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const [userLowId, userHighId] = canonicalFriendPair(me.id, friendId);
    const supabase = createAdminClient();

    const { data: existing, error: fetchError } = await supabase
      .from("friend_expenses")
      .select(
        "id, user_low_id, user_high_id, description, place, amount_paise, paid_by_user_id, split_mode, settled_at, created_at"
      )
      .eq("id", expenseId)
      .eq("user_low_id", userLowId)
      .eq("user_high_id", userHighId)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    if (existing.settled_at) {
      const rows = await fetchFriendExpenseRows(me.id, friendId);
      const { expenses, balance } = buildExpensesPayload(
        rows,
        me.id,
        friend.display_name
      );
      const expense = expenses.find((e) => e.id === existing.id);

      return NextResponse.json({
        friendId,
        expense,
        expenses,
        balance,
      });
    }

    const settledAt = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from("friend_expenses")
      .update({ settled_at: settledAt })
      .eq("id", expenseId)
      .eq("user_low_id", userLowId)
      .eq("user_high_id", userHighId)
      .select(
        "id, user_low_id, user_high_id, description, place, amount_paise, paid_by_user_id, split_mode, settled_at, created_at"
      )
      .single();

    if (updateError || !updated) {
      return NextResponse.json(
        { error: updateError?.message ?? "Could not settle expense" },
        { status: 500 }
      );
    }

    const rows = await fetchFriendExpenseRows(me.id, friendId);
    const { expenses, balance } = buildExpensesPayload(
      rows,
      me.id,
      friend.display_name
    );
    const expense = expenses.find((e) => e.id === updated.id);

    return NextResponse.json({
      friendId,
      expense,
      expenses,
      balance,
    });
  } catch (e) {
    if (e instanceof FriendshipError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
