import {
  computeEnergyAlignmentPercent,
  energyAlignmentTier,
} from "@/lib/friends/alignment";
import { detectAvailability } from "@/lib/friends/availability";
import type { FriendSummary } from "@/lib/types/friends";
import type { SaanjhUser } from "@/lib/types/user";

export type FriendUserRow = Pick<
  SaanjhUser,
  | "id"
  | "display_name"
  | "profile_photo_url"
  | "interest_tags"
  | "lifestyle_tags"
  | "dietary_tags"
  | "calendar_connected"
  | "manual_schedule"
>;

export function toFriendSummaryBase(
  currentUser: SaanjhUser,
  friend: FriendUserRow
): Omit<FriendSummary, "availability"> {
  const energyAlignmentPercent = computeEnergyAlignmentPercent(
    currentUser.interest_tags,
    friend.interest_tags
  );

  return {
    id: friend.id,
    displayName: friend.display_name,
    profilePhotoUrl: friend.profile_photo_url,
    interestTags: friend.interest_tags,
    lifestyleTags: friend.lifestyle_tags,
    dietaryTags: friend.dietary_tags,
    energyAlignmentPercent,
    energyAlignmentTier: energyAlignmentTier(energyAlignmentPercent),
  };
}

export async function toFriendSummary(
  currentUser: SaanjhUser,
  friend: FriendUserRow
): Promise<FriendSummary> {
  const base = toFriendSummaryBase(currentUser, friend);
  const availability = await detectAvailability(currentUser, friend);
  return { ...base, availability };
}
