import { NextResponse } from "next/server";
import { getOrCreateDbUser, getDbUserById, requireAuth } from "@/lib/auth";
import { FriendshipError, assertFriendship } from "@/lib/friends/assertFriendship";
import { generateCollabPlan } from "@/lib/friends/generateCollabPlan";
import {
  isPlanningQuietHours,
  planningQuietHoursPayload,
} from "@/lib/planning/quietHours";

export async function POST(
  _request: Request,
  { params }: { params: { friendId: string } }
) {
  const clerkId = await requireAuth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isPlanningQuietHours()) {
    return NextResponse.json(planningQuietHoursPayload(), { status: 403 });
  }

  try {
    const me = await getOrCreateDbUser(clerkId);
    const { friendId } = params;

    await assertFriendship(me.id, friendId);

    const friend = await getDbUserById(friendId);
    if (!friend) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const result = await generateCollabPlan(me, friend);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof FriendshipError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Plan generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
