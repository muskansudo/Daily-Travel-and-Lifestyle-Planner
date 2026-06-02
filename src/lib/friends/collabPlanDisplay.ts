import type { PlanStop } from "@/lib/ai/plan";
import {
  formatNeighborhood,
  formatTime12h,
  istSortKeyFromHHMM,
} from "@/lib/home/generatePlan";
import type {
  CollabPlanGenerateResponse,
  CollabPlannedWindow,
  CollabSerializedCalendarEvent,
  SharedPlanPayloadV1,
} from "@/lib/types/friends";
import type { TimelineItem, VenueRecommendation } from "@/lib/types/home";
import { DEFAULT_BIAS_LATLNG } from "@/lib/constants/venues";
import { getVenueCategoryImageUrl } from "@/lib/venues/categoryImages";
import {
  inferCollabDisplayNames,
  mergeCollabBusyEvents,
} from "@/lib/friends/collabBusyTimeline";

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

function categoryIcon(category: string): string {
  return CATEGORY_ICONS[category] ?? "place";
}

function eventSortKey(iso: string): number {
  return new Date(iso).getTime();
}

function eventToTimelineItem(
  event: CollabSerializedCalendarEvent
): TimelineItem {
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
  aiGenerated: boolean,
  faded: boolean
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
    accent: faded ? "secondary" : "primary",
    neighborhood: formatNeighborhood(stop.neighborhood),
    category: stop.category,
    aiGenerated,
  };
}

function sharedWindowToTimelineItem(window: CollabPlannedWindow): TimelineItem {
  const start = new Date(window.freeWindow.start);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(start);
  const end = new Date(window.freeWindow.end);
  const endTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(end);

  const faded = window.status === "past";

  return {
    id: `shared-${window.freeWindow.start}`,
    kind: "empty_window",
    time,
    endTime: time !== endTime ? endTime : undefined,
    sortKey: start.getTime(),
    activity: faded ? "Earlier today — free together" : "Free together",
    explanation:
      window.skippedReason === "cap"
        ? "More windows than we could plan in one pass"
        : faded
          ? "Past window"
          : "No venue matches for this slot",
    icon: "schedule",
    accent: faded ? "secondary" : "tertiary",
  };
}

function buildCollabTimelineInternal(
  events: CollabSerializedCalendarEvent[],
  windows: CollabPlannedWindow[]
): TimelineItem[] {
  const items: TimelineItem[] = [];

  const displayNames = inferCollabDisplayNames(events);
  const timelineEvents = mergeCollabBusyEvents(events, displayNames);

  for (const event of timelineEvents) {
    if (!event.allDay) {
      items.push(eventToTimelineItem(event));
    }
  }

  for (const window of windows) {
    const faded = window.status === "past";
    if (window.plan.stops.length === 0) {
      items.push(sharedWindowToTimelineItem(window));
    } else {
      for (const stop of window.plan.stops) {
        items.push(stopToTimelineItem(stop, window.plan.aiGenerated, faded));
      }
    }
  }

  return items.sort((a, b) => a.sortKey - b.sortKey);
}

export function payloadWindowToPlanned(
  w: SharedPlanPayloadV1["windows"][number]
): CollabPlannedWindow {
  return {
    freeWindow: { start: w.freeWindow.startIso, end: w.freeWindow.endIso },
    plan: w.plan,
    candidatesCount: w.candidatesCount,
    status: w.freeWindow.status,
    rangeLabel: w.freeWindow.rangeLabel,
    durationMinutes: w.freeWindow.durationMinutes,
    skippedReason: w.skippedReason,
  };
}

export function buildCollabTimeline(
  response: CollabPlanGenerateResponse
): TimelineItem[] {
  return buildCollabTimelineInternal(response.events, response.windows);
}

export function buildCollabTimelineFromPayload(
  payload: SharedPlanPayloadV1
): TimelineItem[] {
  return buildCollabTimelineInternal(
    payload.events,
    payload.windows.map(payloadWindowToPlanned)
  );
}

export function collabStopsToVenues(
  windows: CollabPlannedWindow[]
): VenueRecommendation[] {
  const allStops = windows.flatMap((w) => w.plan.stops);

  return allStops.map((stop, index) => ({
    id: stop.venueId,
    name: stop.venueName,
    imageUrl: getVenueCategoryImageUrl(stop.category),
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

export function countEmptyCollabWindows(
  response: CollabPlanGenerateResponse
): number {
  return response.windows.filter(
    (w) =>
      w.status !== "past" &&
      w.plan.stops.length === 0 &&
      w.skippedReason !== "past"
  ).length;
}

export function isNoSharedWindows(
  response: CollabPlanGenerateResponse
): boolean {
  return (
    response.debug.reason === "no_shared_windows" ||
    response.windows.length === 0
  );
}

export function canSaveCollabPlan(
  response: CollabPlanGenerateResponse
): boolean {
  if (isNoSharedWindows(response)) return false;
  return response.windows.some((w) => w.plan.stops.length > 0);
}

export function formatCollabTimeRange(time: string, endTime?: string): string {
  const start = formatTime12h(time);
  if (!endTime) return start;
  return `${start} — ${formatTime12h(endTime)}`;
}
