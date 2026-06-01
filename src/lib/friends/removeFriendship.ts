import { createAdminClient } from "@/lib/supabase/admin";
import { canonicalFriendPair } from "@/lib/friends/pair";

/** Removes friendship and all pair-scoped shared plans and expenses. */
export async function removeFriendship(
  currentUserId: string,
  friendUserId: string
): Promise<void> {
  const [userLowId, userHighId] = canonicalFriendPair(
    currentUserId,
    friendUserId
  );
  const supabase = createAdminClient();

  const { error: expensesError } = await supabase
    .from("friend_expenses")
    .delete()
    .eq("user_low_id", userLowId)
    .eq("user_high_id", userHighId);

  if (expensesError) {
    throw new Error(expensesError.message);
  }

  const { error: plansError } = await supabase
    .from("shared_plans")
    .delete()
    .eq("user_low_id", userLowId)
    .eq("user_high_id", userHighId);

  if (plansError) {
    throw new Error(plansError.message);
  }

  const { error: friendshipError } = await supabase
    .from("friendships")
    .delete()
    .eq("user_low_id", userLowId)
    .eq("user_high_id", userHighId);

  if (friendshipError) {
    throw new Error(friendshipError.message);
  }
}
