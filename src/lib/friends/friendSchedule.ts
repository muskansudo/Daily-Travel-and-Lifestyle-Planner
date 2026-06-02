import type { FriendSummary } from "@/lib/types/friends";

/** Friend has not connected calendar nor added a manual schedule on Home. */
export function friendHasNoSchedule(
  friend: Pick<FriendSummary, "availability">
): boolean {
  const kind = friend.availability.kind;
  return (
    kind === "friend_calendar_not_linked" ||
    kind === "both_calendar_not_linked"
  );
}
