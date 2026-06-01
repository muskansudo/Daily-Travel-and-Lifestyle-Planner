import type { Plan, PlanStop } from "@/lib/ai/plan";
import type { MoodResult } from "@/lib/ai/mood";
import type {
  GeneratedPlan,
  ManualScheduleEntry,
  OutfitRecommendation,
  TimelineItem,
  VenueRecommendation,
} from "@/lib/types/home";
import { DEFAULT_BIAS_LATLNG } from "@/lib/constants/venues";
import { DEFAULT_VIBE_IMAGE } from "@/lib/constants/vibes";
import { istTodayAtHHMM } from "@/lib/calendar/manualEvents";

export interface SerializedCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  location: string | null;
  allDay: boolean;
}

export interface PlannedWindowResponse {
  freeWindow: { start: string; end: string };
  plan: Plan;
  candidatesCount: number;
}

export interface PlanGenerateDebug {
  totalWindows: number;
  plannedWindows: number;
  reason?: string;
  ragTopK?: number;
  cappedAt?: number;
}

export interface PlanGenerateResponse {
  windows: PlannedWindowResponse[];
  events: SerializedCalendarEvent[];
  mood: MoodResult | null;
  outfit: OutfitRecommendation | null;
  debug: PlanGenerateDebug;
}

export interface GeneratePlanRequestOptions {
  selectedVibes?: string[];
  vibeImageFile?: File | null;
  manualEntries?: ManualScheduleEntry[];
  allowedNeighborhoods?: string[];
  allowedCategories?: string[];
  hoursAhead?: number;
}

const CATEGORY_ICONS: Record<string, string> = {
  cafe: "coffee",
  restaurant: "restaurant",
  park: "park",
  walk: "directions_walk",
  art: "palette",
  wellness: "spa",
  bookstore: "menu_book",
  bar: "local_bar",
};

const NEIGHBORHOOD_LABELS: Record<string, string> = {
  bagmane_orr: "Bagmane / ORR",
  mg_road_brigade: "MG Road / Brigade",
};

export function formatNeighborhood(id: string): string {
  if (NEIGHBORHOOD_LABELS[id]) return NEIGHBORHOOD_LABELS[id];
  return id
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatTime12h(time: string): string {
  const [hoursRaw, minutesRaw] = time.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw ?? 0);
  if (Number.isNaN(hours)) return time;
  const period = hours >= 12 ? "pm" : "am";
  const h = hours % 12 || 12;
  return `${h}:${String(minutes).padStart(2, "0")}${period}`;
}

function categoryIcon(category: string): string {
  return CATEGORY_ICONS[category] ?? "place";
}

function istSortKeyFromHHMM(time: string): number {
  return istTodayAtHHMM(time).getTime();
}

function eventSortKey(iso: string): number {
  return new Date(iso).getTime();
}

function eventToTimelineItem(event: SerializedCalendarEvent): TimelineItem {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(start);
  const endTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(end);

  return {
    id: `event-${event.id}`,
    kind: "calendar_event",
    time,
    endTime: time !== endTime ? endTime : undefined,
    sortKey: eventSortKey(event.start),
    activity: event.title,
    explanation: event.location ?? undefined,
    icon: "event",
    accent: "secondary",
  };
}

function stopToTimelineItem(
  stop: PlanStop,
  aiGenerated: boolean
): TimelineItem {
  return {
    id: `stop-${stop.venueId}-${stop.startTime}`,
    kind: "plan_stop",
    time: stop.startTime,
    endTime: stop.endTime,
    sortKey: istSortKeyFromHHMM(stop.startTime),
    activity: stop.venueName,
    explanation: stop.whyThis,
    icon: categoryIcon(stop.category),
    accent: "primary",
    neighborhood: formatNeighborhood(stop.neighborhood),
    category: stop.category,
    aiGenerated,
  };
}

export function countEmptyWindows(response: PlanGenerateResponse): number {
  return response.windows.filter((window) => window.plan.stops.length === 0)
    .length;
}

export function buildTimelineFromResponse(
  response: PlanGenerateResponse
): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const event of response.events) {
    if (!event.allDay) {
      items.push(eventToTimelineItem(event));
    }
  }

  for (const window of response.windows) {
    for (const stop of window.plan.stops) {
      items.push(
        stopToTimelineItem(stop, window.plan.aiGenerated)
      );
    }
  }

  return items.sort((a, b) => a.sortKey - b.sortKey);
}

export function buildManualTimeline(
  entries: ManualScheduleEntry[]
): TimelineItem[] {
  return entries
    .filter(
      (entry) =>
        entry.startTime &&
        entry.endTime &&
        entry.startTime !== entry.endTime &&
        entry.activity
    )
    .map((entry) => ({
      id: entry.id,
      kind: "calendar_event" as const,
      time: entry.startTime,
      endTime: entry.endTime,
      sortKey: istSortKeyFromHHMM(entry.startTime),
      activity: entry.activity,
      explanation: entry.explanation,
      icon: "event",
      accent: "secondary" as const,
    }))
    .sort((a, b) => a.sortKey - b.sortKey);
}

export function stopsToVenues(stops: PlanStop[]): VenueRecommendation[] {
  return stops.map((stop, index) => ({
    id: stop.venueId,
    name: stop.venueName,
    imageUrl: DEFAULT_VIBE_IMAGE,
    distance: formatNeighborhood(stop.neighborhood),
    category: stop.category,
    whyThisVenue: stop.whyThis,
    isTopPick: index === 0,
    location: {
      lat: DEFAULT_BIAS_LATLNG.lat,
      lng: DEFAULT_BIAS_LATLNG.lng,
      address: formatNeighborhood(stop.neighborhood),
    },
    route: {
      durationMinutes: 0,
      transportMode: "walking" as const,
      steps: [],
    },
  }));
}

export function buildGeneratedPlanFromResponse(
  response: PlanGenerateResponse
): GeneratedPlan {
  const allStops = response.windows.flatMap((w) => w.plan.stops);

  return {
    timeline: buildTimelineFromResponse(response),
    outfit: response.outfit ?? null,
    venues: stopsToVenues(allStops),
    response,
  };
}

export function isNoCalendarConnected(response: PlanGenerateResponse): boolean {
  return response.events.length === 0 && response.windows.length === 0;
}

export function isPackedDay(response: PlanGenerateResponse): boolean {
  return response.debug.reason === "no_free_window";
}

export async function requestPlanGeneration(
  options: GeneratePlanRequestOptions
): Promise<PlanGenerateResponse> {
  const {
    selectedVibes = [],
    vibeImageFile,
    manualEntries = [],
    allowedNeighborhoods,
    allowedCategories,
    hoursAhead = 16,
  } = options;

  let response: Response;

  if (vibeImageFile) {
    const formData = new FormData();
    formData.append("image", vibeImageFile);

    if (selectedVibes.length > 0) {
      formData.append("vibes", JSON.stringify(selectedVibes));
    }
    if (manualEntries.length > 0) {
      formData.append("manualEntries", JSON.stringify(manualEntries));
    }
    if (allowedNeighborhoods?.length) {
      formData.append(
        "allowedNeighborhoods",
        JSON.stringify(allowedNeighborhoods)
      );
    }
    if (allowedCategories?.length) {
      formData.append(
        "allowedCategories",
        JSON.stringify(allowedCategories)
      );
    }
    formData.append("hoursAhead", String(hoursAhead));

    response = await fetch("/api/plan/generate", {
      method: "POST",
      body: formData,
    });
  } else {
    const body: Record<string, unknown> = { hoursAhead };

    if (selectedVibes.length > 0) {
      body.vibes = selectedVibes;
    }
    if (manualEntries.length > 0) {
      body.manualEntries = manualEntries;
    }
    if (allowedNeighborhoods?.length) {
      body.allowedNeighborhoods = allowedNeighborhoods;
    }
    if (allowedCategories?.length) {
      body.allowedCategories = allowedCategories;
    }

    response = await fetch("/api/plan/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(payload?.error ?? "Plan generation failed");
  }

  return response.json() as Promise<PlanGenerateResponse>;
}
