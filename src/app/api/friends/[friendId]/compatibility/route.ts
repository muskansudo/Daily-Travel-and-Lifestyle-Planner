import { NextResponse } from "next/server";
import { getOrCreateDbUser, getDbUserById, requireAuth } from "@/lib/auth";
import { FriendshipError, assertFriendship } from "@/lib/friends/assertFriendship";
import { buildCompatibilityPayload } from "@/lib/friends/compatibility";

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

    const compatibility = await buildCompatibilityPayload(me, friend);

    return NextResponse.json({ compatibility });
  } catch (e) {
    if (e instanceof FriendshipError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
