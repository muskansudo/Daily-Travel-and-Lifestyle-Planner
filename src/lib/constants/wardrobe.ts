// Wardrobe tag vocabulary
// Kept narrow on purpose: the AI vision call is constrained to these values
// so wardrobe data is always join-friendly with venue/weather context downstream.

export const WARDROBE_CATEGORIES = [
  { id: "top", label: "Top" },
  { id: "bottom", label: "Bottom" },
  { id: "dress", label: "Dress / Kurta" },
  { id: "outerwear", label: "Outerwear" },
  { id: "footwear", label: "Footwear" },
  { id: "accessory", label: "Accessory" },
] as const;

export const WARDROBE_COLORS = [
  { id: "black", label: "Black", swatch: "#1a1a1a" },
  { id: "white", label: "White", swatch: "#f5f5f0" },
  { id: "cream", label: "Cream", swatch: "#f3e6d4" },
  { id: "beige", label: "Beige", swatch: "#d6b894" },
  { id: "brown", label: "Brown", swatch: "#7a4a2a" },
  { id: "gray", label: "Gray", swatch: "#8a8a8a" },
  { id: "navy", label: "Navy", swatch: "#1e2a4a" },
  { id: "blue", label: "Blue", swatch: "#3b6ea8" },
  { id: "teal", label: "Teal", swatch: "#2a8a8a" },
  { id: "green", label: "Green", swatch: "#5a8a4a" },
  { id: "olive", label: "Olive", swatch: "#7a7a3a" },
  { id: "yellow", label: "Yellow", swatch: "#e8c25a" },
  { id: "orange", label: "Orange", swatch: "#d97a3a" },
  { id: "red", label: "Red", swatch: "#b83a3a" },
  { id: "pink", label: "Pink", swatch: "#e8a5b5" },
  { id: "purple", label: "Purple", swatch: "#7a4a8a" },
  { id: "maroon", label: "Maroon", swatch: "#6a2a3a" },
  { id: "multicolor", label: "Multicolor", swatch: "#c49eec" },
] as const;

export const WARDROBE_OCCASIONS = [
  { id: "casual", label: "Casual" },
  { id: "work", label: "Work" },
  { id: "festive", label: "Festive" },
  { id: "loungewear", label: "Loungewear" },
  { id: "formal", label: "Formal" },
  { id: "workout", label: "Workout" },
] as const;

export const WARDROBE_SEASONS = [
  { id: "summer", label: "Summer" },
  { id: "monsoon", label: "Monsoon" },
  { id: "winter", label: "Winter" },
  { id: "all_season", label: "All season" },
] as const;

export type WardrobeCategoryId = (typeof WARDROBE_CATEGORIES)[number]["id"];
export type WardrobeColorId = (typeof WARDROBE_COLORS)[number]["id"];
export type WardrobeOccasionId = (typeof WARDROBE_OCCASIONS)[number]["id"];
export type WardrobeSeasonId = (typeof WARDROBE_SEASONS)[number]["id"];

// Lookup helpers — kept inline so React components can colour-render quickly.
export const COLOR_SWATCH: Record<string, string> = Object.fromEntries(
  WARDROBE_COLORS.map((c) => [c.id, c.swatch])
);

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  WARDROBE_CATEGORIES.map((c) => [c.id, c.label])
);

export const OCCASION_LABEL: Record<string, string> = Object.fromEntries(
  WARDROBE_OCCASIONS.map((o) => [o.id, o.label])
);

export const SEASON_LABEL: Record<string, string> = Object.fromEntries(
  WARDROBE_SEASONS.map((s) => [s.id, s.label])
);
