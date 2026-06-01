import { NextResponse } from "next/server";
import { getOrCreateDbUser, getDbUserById, requireAuth } from "@/lib/auth";
import { FriendshipError, assertFriendship } from "@/lib/friends/assertFriendship";
import { canonicalFriendPair } from "@/lib/friends/pair";
import type { SharedPlanDetailDTO, SharedPlanPayloadV1 } from "@/lib/types/friends";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: { friendId: string; planId: string } }
) {
  const clerkId = await requireAuth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const me = await getOrCreateDbUser(clerkId);
    const { friendId, planId } = params;

    await assertFriendship(me.id, friendId);

    const friend = await getDbUserById(friendId);
    if (!friend) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const [userLowId, userHighId] = canonicalFriendPair(me.id, friendId);
    const supabase = createAdminClient();

    const { data: row, error } = await supabase
      .from("shared_plans")
      .select("id, title, status, created_at, updated_at, plan_payload")
      .eq("id", planId)
      .eq("user_low_id", userLowId)
      .eq("user_high_id", userHighId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!row) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const payload = row.plan_payload as SharedPlanPayloadV1 | null;
    if (!payload || payload.version !== 1) {
      return NextResponse.json(
        { error: "Plan data unavailable" },
        { status: 404 }
      );
    }

    const plan: SharedPlanDetailDTO = {
      id: row.id,
      title: row.title,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      windowCount: payload.windows.length,
      firstWindowLabel: payload.windows[0]?.freeWindow.rangeLabel ?? null,
      planPayload: payload,
      friendId,
      friendDisplayName: friend.display_name,
    };

    return NextResponse.json({ plan });
  } catch (e) {
    if (e instanceof FriendshipError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { friendId: string; planId: string } }
) {
  const clerkId = await requireAuth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const me = await getOrCreateDbUser(clerkId);
    const { friendId, planId } = params;

    await assertFriendship(me.id, friendId);

    const [userLowId, userHighId] = canonicalFriendPair(me.id, friendId);
    const supabase = createAdminClient();

    const { data: row, error: fetchError } = await supabase
      .from("shared_plans")
      .select("id")
      .eq("id", planId)
      .eq("user_low_id", userLowId)
      .eq("user_high_id", userHighId)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!row) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from("shared_plans")
      .delete()
      .eq("id", planId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, planId });
  } catch (e) {
    if (e instanceof FriendshipError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
