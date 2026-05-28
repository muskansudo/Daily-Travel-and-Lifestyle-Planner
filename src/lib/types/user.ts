export interface SaanjhUser {
  id: string;
  clerk_id: string;
  email: string | null;
  username: string | null;
  display_name: string | null;
  profile_photo_url: string | null;
  dietary_tags: string[];
  lifestyle_tags: string[];
  interest_tags: string[];
  activity_tags: string[];
  onboarding_profile_complete: boolean;
  onboarding_preferences_complete: boolean;
  onboarding_calendar_complete: boolean;
  onboarding_wardrobe_complete: boolean;
  city: string | null;
  google_access_token: string | null;
  google_refresh_token: string | null;
  google_token_expiry: string | null;
  google_email: string | null;
  calendar_connected: boolean;
  created_at: string;
  updated_at: string;
}

export interface OnboardingStatus {
  profile: boolean;
  preferences: boolean;
  calendar: boolean;
  wardrobe: boolean;
  nextStep:
    | "/onboarding/profile"
    | "/onboarding/preferences"
    | "/onboarding/calendar"
    | "/onboarding/wardrobe"
    | "/home";
  isComplete: boolean;
}
