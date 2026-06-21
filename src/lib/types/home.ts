// DROP IN AT: src/lib/types/home.ts (REPLACES existing file)

import type { PlanGenerateResponse } from "@/lib/home/generatePlan";
import type { VenueVibeId } from "@/lib/constants/venues";
import type { WardrobeCategoryId } from "@/lib/constants/wardrobe";
import type { CardSuggestion } from "@/lib/ai/card";

export type HomePageState = "initial" | "generating" | "generated";

export type VibeId = VenueVibeId;

export interface VibeOption {
  id: VibeId;
  label: string;
}

export type TimelineItemKind =
  | "calendar_event"
  | "plan_stop"
  | "empty_window"
  | "manual";

export interface WeatherInfo {
  temperature: number;
  condition: string;
  icon: string;
  // AQI from the India AQI source; null when unavailable. Read by HomeHeader.
  aqi?: number | null;
  aqiLabel?: string | null;
}

export interface TimelineItem {
  id: string;
  kind: TimelineItemKind;
  time: string;
  sortKey: number;
  activity: string;
  explanation?: string;
  icon?: string;
  accent?: "primary" | "tertiary" | "secondary";
  endTime?: string;
  neighborhood?: string;
  category?: string;
  aiGenerated?: boolean;
  // Block 3: best card for this stop's spend type. Null for non-spend stops
  // (park, walk) and manual entries. Populated by the timeline mapper.
  cardSuggestion?: CardSuggestion | null;
}

// One concrete garment in the outfit-of-the-day. Mirror of OutfitItemPick from
// src/lib/ai/outfit.ts, but flattened with a display label so the UI can render
// without reaching back into wardrobe constants.
export interface OutfitItem {
  category: WardrobeCategoryId;
  photoUrl: string;
  label: string;
}

export interface OutfitRecommendation {
  // imageUrl is the hero / lead photo (used as the big image on the card).
  // Kept alongside items so existing code paths reading imageUrl still work.
  imageUrl: string;
  // Full pick in display order: core piece(s) first, then footwear, outerwear,
  // accessory. The card renders this as a hero plus a thumbnail strip.
  items: OutfitItem[];
  subtitle: string;
  title: string;
  explanation: string;
}

export interface VenueLocation {
  lat: number;
  lng: number;
  address: string;
}

export interface VenueRouteStep {
  instruction: string;
  distance: string;
}

export interface VenueRouteInfo {
  durationMinutes: number;
  transportMode: "walking" | "driving" | "transit";
  steps: VenueRouteStep[];
}

export interface VenueRecommendation {
  id: string;
  name: string;
  imageUrl: string;
  distance: string;
  category: string;
  whyThisVenue: string;
  isTopPick?: boolean;
  location: VenueLocation;
  route: VenueRouteInfo;
  // Best card for spending at this stop. null on free / low-spend stops
  // (park, walk, art). Populated by the mappers via suggestCardForCategory().
  cardSuggestion?: CardSuggestion | null;
}

export interface GeneratedPlan {
  timeline: TimelineItem[];
  outfit: OutfitRecommendation | null;
  venues: VenueRecommendation[];
  response?: PlanGenerateResponse;
}

export interface GeneratePlanFilters {
  allowedNeighborhoods?: string[];
  allowedCategories?: string[];
  hoursAhead?: number;
}

export interface ManualScheduleEntry {
  id: string;
  startTime: string;
  endTime: string;
  activity: string;
  explanation?: string;
}

export type GenerationStepId =
  | "calendar"
  | "slots"
  | "venues"
  | "outfit"
  | "plan";

export interface GenerationStep {
  id: GenerationStepId;
  label: string;
  icon: string;
}
