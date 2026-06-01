import { NextResponse } from "next/server";
import { getOrCreateDbUser, getDbUserById, requireAuth } from "@/lib/auth";
import { FriendshipError, assertFriendship } from "@/lib/friends/assertFriendship";
import { inrToPaise } from "@/lib/friends/balance";
import {
  buildExpensesPayload,
  fetchFriendExpenseRows,
} from "@/lib/friends/expensesApi";
import { canonicalFriendPair } from "@/lib/friends/pair";
import { createAdminClient } from "@/lib/supabase/admin";
import { createExpenseSchema } from "@/lib/validations/friends";

export async function GET(
  _request: Request,
  { params }: { params: { friendId: string } }
) {
  const clerkId = await requireAuth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const me = await getOrCreateDbUser(clerkId);
    const { friendId } = params;

    await assertFriendship(me.id, friendId);

    const friend = await getDbUserById(friendId);
    if (!friend) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const rows = await fetchFriendExpenseRows(me.id, friendId);
    const { expenses, balance } = buildExpensesPayload(
      rows,
      me.id,
      friend.display_name
    );

    return NextResponse.json({
      friendId,
      friendDisplayName: friend.display_name,
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

export async function POST(
  request: Request,
  { params }: { params: { friendId: string } }
) {
  const clerkId = await requireAuth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = createExpenseSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const me = await getOrCreateDbUser(clerkId);
    const { friendId } = params;

    await assertFriendship(me.id, friendId);

    const friend = await getDbUserById(friendId);
    if (!friend) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { description, place, amountInr, paidBy } = parsed.data;
    const [userLowId, userHighId] = canonicalFriendPair(me.id, friendId);
    const paidByUserId = paidBy === "me" ? me.id : friendId;
    const amountPaise = inrToPaise(amountInr);

    const supabase = createAdminClient();
    const { data: inserted, error: insertError } = await supabase
      .from("friend_expenses")
      .insert({
        user_low_id: userLowId,
        user_high_id: userHighId,
        description,
        place: place?.trim() || null,
        amount_paise: amountPaise,
        paid_by_user_id: paidByUserId,
        split_mode: "equal",
      })
      .select(
        "id, user_low_id, user_high_id, description, place, amount_paise, paid_by_user_id, split_mode, settled_at, created_at"
      )
      .single();

    if (insertError || !inserted) {
      return NextResponse.json(
        { error: insertError?.message ?? "Could not add expense" },
        { status: 500 }
      );
    }

    const rows = await fetchFriendExpenseRows(me.id, friendId);
    const { expenses, balance } = buildExpensesPayload(
      rows,
      me.id,
      friend.display_name
    );
    const expense = expenses.find((e) => e.id === inserted.id);

    return NextResponse.json(
      {
        friendId,
        friendDisplayName: friend.display_name,
        expense,
        expenses,
        balance,
      },
      { status: 201 }
    );
  } catch (e) {
    if (e instanceof FriendshipError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
