import { NextResponse } from "next/server";
import { getOrCreateDbUser, requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FriendSearchResult } from "@/lib/types/friends";

const SEARCH_LIMIT = 20;

export async function GET(request: Request) {
  const clerkId = await requireAuth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";

  if (q.length < 1) {
    return NextResponse.json({ results: [] });
  }

  if (q.length > 80) {
    return NextResponse.json(
      { error: "Search query is too long" },
      { status: 400 }
    );
  }

  try {
    const user = await getOrCreateDbUser(clerkId);
    const supabase = createAdminClient();

    const { data: friendships, error: friendError } = await supabase
      .from("friendships")
      .select("user_low_id, user_high_id")
      .or(`user_low_id.eq.${user.id},user_high_id.eq.${user.id}`);

    if (friendError) {
      return NextResponse.json({ error: friendError.message }, { status: 500 });
    }

    const existingFriendIds = new Set(
      (friendships ?? []).map((row) =>
        row.user_low_id === user.id ? row.user_high_id : row.user_low_id
      )
    );
    existingFriendIds.add(user.id);

    const safeQuery = q.replace(/[%_]/g, "");
    const pattern = `%${safeQuery}%`;

    const { data: rows, error: searchError } = await supabase
      .from("users")
      .select("id, display_name, profile_photo_url")
      .ilike("display_name", pattern)
      .not("display_name", "is", null)
      .limit(SEARCH_LIMIT + existingFriendIds.size);

    if (searchError) {
      return NextResponse.json({ error: searchError.message }, { status: 500 });
    }

    const results: FriendSearchResult[] = (rows ?? [])
      .filter((row) => !existingFriendIds.has(row.id))
      .slice(0, SEARCH_LIMIT)
      .map((row) => ({
        id: row.id,
        displayName: row.display_name,
        profilePhotoUrl: row.profile_photo_url,
      }));

    return NextResponse.json({ results });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
