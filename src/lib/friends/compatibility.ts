import {
  computeEnergyAlignmentPercent,
  intersectTags,
} from "@/lib/friends/alignment";
import {
  detectAvailability,
  getTodaySharedFreeWindows,
  windowsToSharedFreeTimes,
} from "@/lib/friends/availability";
import { tagIdsToLabels } from "@/lib/friends/tagLabels";
import type { CompatibilityPayload } from "@/lib/types/friends";
import type { SaanjhUser } from "@/lib/types/user";

export async function buildCompatibilityPayload(
  me: SaanjhUser,
  friend: SaanjhUser
): Promise<CompatibilityPayload> {
  const sharedInterestTags = intersectTags(
    me.interest_tags,
    friend.interest_tags
  );
  const sharedLifestyleTags = intersectTags(
    me.lifestyle_tags,
    friend.lifestyle_tags
  );
  const sharedDietaryTags = intersectTags(me.dietary_tags, friend.dietary_tags);

  const availability = await detectAvailability(me, friend);
  const todayWindows = await getTodaySharedFreeWindows(me, friend);
  const sharedFreeTimes = windowsToSharedFreeTimes(todayWindows);

  return {
    friendId: friend.id,
    friendDisplayName: friend.display_name,
    energyAlignmentPercent: computeEnergyAlignmentPercent(
      me.interest_tags,
      friend.interest_tags
    ),
    availability,
    sharedFreeTimes,
    sharedInterestTags,
    sharedLifestyleTags,
    sharedDietaryTags,
    sharedInterestLabels: tagIdsToLabels(sharedInterestTags),
    sharedLifestyleLabels: tagIdsToLabels(sharedLifestyleTags),
    sharedDietaryLabels: tagIdsToLabels(sharedDietaryTags),
  };
}
