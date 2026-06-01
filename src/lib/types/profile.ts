// ── PROFILE TYPES ─────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  clerk_user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  ai_integration_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpdateProfilePayload {
  display_name?: string;
  username?: string;
  avatar_url?: string;
  bio?: string;
  location?: string;
  ai_integration_enabled?: boolean;
}

// ── WARDROBE TYPES ────────────────────────────────────────────────────────────
export type WardrobeCategory =
  | "top"
  | "bottom"
  | "outerwear"
  | "shoes"
  | "accessory"
  | "other";

export type WeatherSuitability = "hot" | "mild" | "cold" | "rainy" | "all";

export interface WardrobeItem {
  id: string;
  user_id: string;
  name: string;
  category: WardrobeCategory;
  brand: string | null;
  color: string | null;
  image_url: string | null;
  tags: string[];
  weather_suitability: WeatherSuitability[];
  vibe_tags: string[];
  is_favorite: boolean;
  ai_tagged: boolean;
  created_at: string;
}

export interface CreateWardrobeItemPayload {
  name: string;
  category: WardrobeCategory;
  brand?: string;
  color?: string;
  image_url?: string;
  tags?: string[];
}

// ── CALENDAR TYPES ────────────────────────────────────────────────────────────
export type CalendarProvider = "google" | "icloud" | "outlook";

export interface ConnectedCalendar {
  id: string;
  user_id: string;
  name: string;
  provider: CalendarProvider;
  is_connected: boolean;
  last_synced_at: string | null;
  created_at: string;
}

// ── DIETARY TYPES ─────────────────────────────────────────────────────────────
export interface DietaryPreference {
  label: string;
  icon: string;
  is_active: boolean;
}

export interface DietarySettings {
  id: string;
  user_id: string;
  preferences: DietaryPreference[];
  allergies: string[];
  nutrition_goal: string | null;
  updated_at: string;
}
