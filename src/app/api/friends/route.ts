import { NextResponse } from "next/server";
import { getOrCreateDbUser, getDbUserById, requireAuth } from "@/lib/auth";
import { canonicalFriendPair } from "@/lib/friends/pair";
import { toFriendSummary } from "@/lib/friends/serialize";
import { createAdminClient } from "@/lib/supabase/admin";
import { addFriendSchema } from "@/lib/validations/friends";

const FRIEND_USER_COLUMNS =
  "id, display_name, profile_photo_url, interest_tags, lifestyle_tags, dietary_tags, calendar_connected, manual_schedule";

export async function GET() {
  const clerkId = await requireAuth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await getOrCreateDbUser(clerkId);
    const supabase = createAdminClient();

    const { data: friendships, error: listError } = await supabase
      .from("friendships")
      .select("user_low_id, user_high_id")
      .or(`user_low_id.eq.${user.id},user_high_id.eq.${user.id}`);

    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    const friendIds = (friendships ?? []).map((row) =>
      row.user_low_id === user.id ? row.user_high_id : row.user_low_id
    );

    if (friendIds.length === 0) {
      return NextResponse.json({ friends: [] });
    }

    const { data: friendRows, error: usersError } = await supabase
      .from("users")
      .select(FRIEND_USER_COLUMNS)
      .in("id", friendIds);

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 });
    }

    const byId = new Map((friendRows ?? []).map((row) => [row.id, row]));
    const friends = await Promise.all(
      friendIds
        .map((id) => byId.get(id))
        .filter((row): row is NonNullable<typeof row> => row != null)
        .map((row) => toFriendSummary(user, row))
    );

    return NextResponse.json({ friends });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const clerkId = await requireAuth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = addFriendSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { friendUserId } = parsed.data;
    const user = await getOrCreateDbUser(clerkId);

    if (friendUserId === user.id) {
      return NextResponse.json(
        { error: "You cannot add yourself as a friend" },
        { status: 400 }
      );
    }

    const friend = await getDbUserById(friendUserId);
    if (!friend) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const [userLowId, userHighId] = canonicalFriendPair(user.id, friendUserId);
    const supabase = createAdminClient();

    const { data: existing } = await supabase
      .from("friendships")
      .select("id")
      .eq("user_low_id", userLowId)
      .eq("user_high_id", userHighId)
      .maybeSingle();

    if (!existing) {
      const { error: insertError } = await supabase.from("friendships").insert({
        user_low_id: userLowId,
        user_high_id: userHighId,
        created_by: user.id,
      });

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    const summary = await toFriendSummary(user, friend);

    return NextResponse.json({ friend: summary }, { status: existing ? 200 : 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
