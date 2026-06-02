import { createAdminClient } from "@/lib/supabase/admin";
import { canonicalFriendPair } from "@/lib/friends/pair";

export class FriendshipError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "FriendshipError";
  }
}

export async function assertFriendship(
  currentUserId: string,
  friendUserId: string
): Promise<void> {
  if (currentUserId === friendUserId) {
    throw new FriendshipError("Cannot target yourself", 400);
  }

  const [userLowId, userHighId] = canonicalFriendPair(
    currentUserId,
    friendUserId
  );

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("friendships")
    .select("id")
    .eq("user_low_id", userLowId)
    .eq("user_high_id", userHighId)
    .maybeSingle();

  if (error) {
    throw new FriendshipError(error.message, 500);
  }

  if (!data) {
    throw new FriendshipError("Not friends with this user", 404);
  }
}

export async function friendshipExists(
  currentUserId: string,
  friendUserId: string
): Promise<boolean> {
  const [userLowId, userHighId] = canonicalFriendPair(
    currentUserId,
    friendUserId
  );

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("friendships")
    .select("id")
    .eq("user_low_id", userLowId)
    .eq("user_high_id", userHighId)
    .maybeSingle();

  if (error) {
    throw new FriendshipError(error.message, 500);
  }

  return Boolean(data);
}
