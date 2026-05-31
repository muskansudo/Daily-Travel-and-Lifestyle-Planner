import type { GenerationStep, VibeOption } from "@/lib/types/home";
import { VENUE_VIBES } from "@/lib/constants/venues";

export const VIBE_OPTIONS: VibeOption[] = VENUE_VIBES.map((id) => ({
  id,
  label: id.charAt(0).toUpperCase() + id.slice(1),
}));

export const MAX_VIBE_SELECTIONS = 3;

export const DEFAULT_VIBE_IMAGE =
  "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1200&q=80";

export const GENERATION_STEPS: GenerationStep[] = [
  { id: "calendar", label: "Analyzing Calendar...", icon: "calendar_month" },
  { id: "slots", label: "Detecting Free Slots...", icon: "schedule" },
  { id: "venues", label: "Matching Venues...", icon: "location_on" },
  { id: "outfit", label: "Building Outfit...", icon: "checkroom" },
  { id: "plan", label: "Generating Plan...", icon: "auto_awesome" },
];
