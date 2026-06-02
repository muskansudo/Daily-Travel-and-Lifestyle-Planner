import type { CollabSerializedCalendarEvent } from "@/lib/types/friends";

type Owner = "me" | "friend";

interface ParsedBusy {
  id: string;
  owner: Owner;
  activity: string;
  start: Date;
  end: Date;
  location: string | null;
}

function parseCollabEvent(
  event: CollabSerializedCalendarEvent
): ParsedBusy | null {
  if (event.allDay) return null;

  const start = new Date(event.start);
  const end = new Date(event.end);
  if (Number.isNaN(start.getTime()) || end <= start) return null;

  let owner: Owner = event.id.startsWith("friend-") ? "friend" : "me";
  let activity = event.title;

  const colon = event.title.indexOf(":");
  if (colon > 0) {
    activity = event.title.slice(colon + 1).trim() || event.title;
  }

  return {
    id: event.id,
    owner,
    activity,
    start,
    end,
    location: event.location,
  };
}

function intervalsOverlap(a: ParsedBusy, b: ParsedBusy): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Union-find connected components of overlapping busy intervals. */
function clusterBusyEvents(events: ParsedBusy[]): ParsedBusy[][] {
  if (events.length === 0) return [];

  const parent = events.map((_, i) => i);

  function find(i: number): number {
    if (parent[i] !== i) parent[i] = find(parent[i]);
    return parent[i];
  }

  function union(a: number, b: number) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  }

  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      if (intervalsOverlap(events[i], events[j])) {
        union(i, j);
      }
    }
  }

  const groups = new Map<number, ParsedBusy[]>();
  for (let i = 0; i < events.length; i++) {
    const root = find(i);
    const list = groups.get(root) ?? [];
    list.push(events[i]);
    groups.set(root, list);
  }

  return Array.from(groups.values());
}

function unionBounds(events: ParsedBusy[]): { start: Date; end: Date } {
  let start = events[0].start;
  let end = events[0].end;
  for (const event of events) {
    if (event.start < start) start = event.start;
    if (event.end > end) end = event.end;
  }
  return { start, end };
}

function isRestBlock(events: ParsedBusy[]): boolean {
  return events.every((e) => /\bsleep\b/i.test(e.activity));
}

function bothBusyLabel(events: ParsedBusy[]): {
  title: string;
  explanation: string;
} {
  if (isRestBlock(events)) {
    return {
      title: "Both resting",
      explanation: "Quiet hours overlap — not the moment to plan.",
    };
  }

  const activitySet = new Set<string>();
  for (const e of events) {
    if (e.activity) activitySet.add(e.activity);
  }
  const activities = Array.from(activitySet);
  const detail =
    activities.length <= 2
      ? activities.join(" · ")
      : `${activities.slice(0, 2).join(" · ")} + more`;

  return {
    title: "Both occupied",
    explanation: detail
      ? `Schedules overlap — ${detail}`
      : "Schedules overlap — neither of you is free here.",
  };
}

function singleBusyTitle(event: ParsedBusy, displayNames: CollabDisplayNames): string {
  const name = event.owner === "me" ? displayNames.me : displayNames.friend;
  return `${name}: ${event.activity}`;
}

export interface CollabDisplayNames {
  me: string;
  friend: string;
}

/**
 * When both people have busy blocks that overlap, show one merged interval
 * (union of times) instead of separate per-person cards.
 */
export function mergeCollabBusyEvents(
  events: CollabSerializedCalendarEvent[],
  displayNames?: CollabDisplayNames
): CollabSerializedCalendarEvent[] {
  const parsed = events
    .map(parseCollabEvent)
    .filter((e): e is ParsedBusy => e !== null);

  if (parsed.length === 0) return [];

  const names: CollabDisplayNames = displayNames ?? {
    me: "You",
    friend: "Friend",
  };

  const merged: CollabSerializedCalendarEvent[] = [];

  for (const cluster of clusterBusyEvents(parsed)) {
    const owners = new Set(cluster.map((e) => e.owner));
    const { start, end } = unionBounds(cluster);

    if (owners.has("me") && owners.has("friend")) {
      const { title, explanation } = bothBusyLabel(cluster);
      merged.push({
        id: `both-busy-${start.getTime()}-${end.getTime()}`,
        title,
        start: start.toISOString(),
        end: end.toISOString(),
        location: explanation,
        allDay: false,
      });
      continue;
    }

    for (const event of cluster) {
      merged.push({
        id: event.id,
        title: singleBusyTitle(event, names),
        start: event.start.toISOString(),
        end: event.end.toISOString(),
        location: event.location,
        allDay: false,
      });
    }
  }

  return merged.sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );
}

/** Infer display names from prefixed event titles when not provided. */
export function inferCollabDisplayNames(
  events: CollabSerializedCalendarEvent[]
): CollabDisplayNames {
  let me = "You";
  let friend = "Friend";

  for (const event of events) {
    const colon = event.title.indexOf(":");
    if (colon <= 0) continue;
    const prefix = event.title.slice(0, colon).trim();
    if (event.id.startsWith("me-")) me = prefix;
    if (event.id.startsWith("friend-")) friend = prefix;
  }

  return { me, friend };
}
