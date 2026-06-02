import type { FriendshipPair } from "@/lib/types/friends";

/** Canonical undirected pair: lexicographically smaller UUID first. */
export function canonicalFriendPair(
  userIdA: string,
  userIdB: string
): [string, string] {
  return userIdA < userIdB ? [userIdA, userIdB] : [userIdB, userIdA];
}

export function toFriendshipPair(
  userIdA: string,
  userIdB: string
): FriendshipPair {
  const [userLowId, userHighId] = canonicalFriendPair(userIdA, userIdB);
  return { userLowId, userHighId };
}

export function otherUserIdInPair(
  pair: FriendshipPair,
  userId: string
): string | null {
  if (userId === pair.userLowId) return pair.userHighId;
  if (userId === pair.userHighId) return pair.userLowId;
  return null;
}
