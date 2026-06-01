import { NextResponse } from "next/server";
import { getOrCreateDbUser, getDbUserById, requireAuth } from "@/lib/auth";
import { FriendshipError, assertFriendship } from "@/lib/friends/assertFriendship";
import { canonicalFriendPair } from "@/lib/friends/pair";
import type { SharedPlanDTO, SharedPlanPayloadV1 } from "@/lib/types/friends";
import { saveSharedPlanSchema } from "@/lib/validations/friends";
import { createAdminClient } from "@/lib/supabase/admin";

function listFieldsFromPayload(
  planPayload: unknown
): Pick<SharedPlanDTO, "windowCount" | "firstWindowLabel"> {
  if (
    !planPayload ||
    typeof planPayload !== "object" ||
    (planPayload as SharedPlanPayloadV1).version !== 1
  ) {
    return {};
  }
  const payload = planPayload as SharedPlanPayloadV1;
  const first = payload.windows[0];
  return {
    windowCount: payload.windows.length,
    firstWindowLabel: first?.freeWindow.rangeLabel ?? null,
  };
}

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

    const [userLowId, userHighId] = canonicalFriendPair(me.id, friendId);
    const supabase = createAdminClient();

    const { data: rows, error } = await supabase
      .from("shared_plans")
      .select("id, title, status, created_at, updated_at, plan_payload")
      .eq("user_low_id", userLowId)
      .eq("user_high_id", userHighId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const plans: SharedPlanDTO[] = (rows ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...listFieldsFromPayload(row.plan_payload),
    }));

    return NextResponse.json({
      friendId,
      friendDisplayName: friend.display_name,
      plans,
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
    const me = await getOrCreateDbUser(clerkId);
    const { friendId } = params;

    await assertFriendship(me.id, friendId);

    const friend = await getDbUserById(friendId);
    if (!friend) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = saveSharedPlanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid plan data",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const [userLowId, userHighId] = canonicalFriendPair(me.id, friendId);
    const supabase = createAdminClient();

    const friendName = friend.display_name?.trim() || "your friend";
    const summaryWindow = parsed.data.payload.windows.find((w) =>
      w.plan.summary?.trim()
    );
    const title =
      parsed.data.title?.trim() ||
      summaryWindow?.plan.summary.trim() ||
      `Joint plan with ${friendName}`;

    const planPayload = {
      ...parsed.data.payload,
      createdByUserId: me.id,
    };

    const { data: row, error } = await supabase
      .from("shared_plans")
      .insert({
        user_low_id: userLowId,
        user_high_id: userHighId,
        title,
        status: "active",
        plan_payload: planPayload,
        created_by: me.id,
      })
      .select("id, title, status, created_at, updated_at")
      .single();

    if (error || !row) {
      return NextResponse.json(
        { error: error?.message ?? "Could not save plan" },
        { status: 500 }
      );
    }

    const plan: SharedPlanDTO = {
      id: row.id,
      title: row.title,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      windowCount: parsed.data.payload.windows.length,
      firstWindowLabel:
        parsed.data.payload.windows[0]?.freeWindow.rangeLabel ?? null,
    };

    return NextResponse.json({ plan, friendId });
  } catch (e) {
    if (e instanceof FriendshipError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
