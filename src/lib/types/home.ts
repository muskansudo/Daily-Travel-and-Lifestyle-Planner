import type { PlanGenerateResponse } from "@/lib/home/generatePlan";
import type { VenueVibeId } from "@/lib/constants/venues";

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
}

export interface OutfitRecommendation {
  imageUrl: string;
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
