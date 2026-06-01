import { auth, currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SaanjhUser } from "@/lib/types/user";
import type { OnboardingStatus } from "@/lib/types/user";

export async function requireAuth(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}

export async function getOrCreateDbUser(clerkId: string): Promise<SaanjhUser> {
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("clerk_id", clerkId)
    .maybeSingle();

  if (existing) {
    return existing as SaanjhUser;
  }

  const clerkUser = await currentUser();
  const email =
    clerkUser?.emailAddresses.find(
      (e) => e.id === clerkUser.primaryEmailAddressId
    )?.emailAddress ?? null;
  const username = clerkUser?.username?.toLowerCase() ?? null;

  const { data: created, error } = await supabase
    .from("users")
    .insert({
      clerk_id: clerkId,
      email,
      username,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create user: ${error.message}`);
  }

  return created as SaanjhUser;
}

export async function getDbUserById(userId: string): Promise<SaanjhUser | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  return data as SaanjhUser | null;
}

export function getOnboardingStatus(user: SaanjhUser): OnboardingStatus {
  const profile = user.onboarding_profile_complete;
  const preferences = user.onboarding_preferences_complete;
  const calendar = user.onboarding_calendar_complete;
  const wardrobe = user.onboarding_wardrobe_complete;

  let nextStep: OnboardingStatus["nextStep"] = "/home";
  if (!profile) nextStep = "/onboarding/profile";
  else if (!preferences) nextStep = "/onboarding/preferences";
  else if (!calendar) nextStep = "/onboarding/calendar";
  else if (!wardrobe) nextStep = "/onboarding/wardrobe";

  return {
    profile,
    preferences,
    calendar,
    wardrobe,
    nextStep,
    isComplete: profile && preferences && calendar && wardrobe,
  };
}
