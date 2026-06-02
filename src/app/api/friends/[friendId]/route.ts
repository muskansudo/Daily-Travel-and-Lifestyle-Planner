import { NextResponse } from "next/server";
import { getOrCreateDbUser, requireAuth } from "@/lib/auth";
import { FriendshipError, assertFriendship } from "@/lib/friends/assertFriendship";
import { removeFriendship } from "@/lib/friends/removeFriendship";

export async function DELETE(
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

    if (friendId === me.id) {
      return NextResponse.json(
        { error: "Cannot remove yourself" },
        { status: 400 }
      );
    }

    await assertFriendship(me.id, friendId);
    await removeFriendship(me.id, friendId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof FriendshipError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
