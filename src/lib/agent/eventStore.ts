// Agent layer — in-memory event store.
//
// Stage 3 keeps events in process memory. For a single-server demo on Vercel
// preview or localhost, this is fine: events live for the life of the
// process, the status endpoint reads them, and a fresh deploy resets them.
//
// IMPORTANT — state is stored on globalThis, NOT in module-level `let`. Why:
// Next.js dev mode can instantiate different copies of the same module for
// different routes, especially when routes are compiled lazily. Module-level
// state then ends up split across instances: one route writes, another reads,
// they see different arrays. The globalThis pattern (used by Prisma, NextAuth,
// etc.) guarantees a single shared instance across all routes in the same
// process. This is the standard Next.js dev-mode fix for in-memory singletons.
// In production builds it makes no difference; in dev it's the difference
// between "POST /simulate then POST /repair sees the event" working or not.
//
// L4 trajectory: swap this module's exports with a Supabase-backed
// equivalent (insert into `agent_events` table on append, select with
// LIMIT 20 ORDER BY created_at DESC on getRecent). Same function
// signatures, no callsite changes. Persistence is a one-file swap, not a
// rewrite — and that's the answer when the panel asks about production
// state management.

import type { DisruptionEvent, MonitorSnapshot } from "@/lib/agent/types";

const MAX_EVENTS = 20;

// Single shared store on globalThis. Keyed under a namespaced symbol so we
// don't collide with anything else in the process.
const STORE_KEY = "__saanjh_agent_store__" as const;

type Store = {
  recentEvents: DisruptionEvent[];
  lastSnapshot: MonitorSnapshot | null;
};

function getStore(): Store {
  const g = globalThis as unknown as Record<string, Store | undefined>;
  if (!g[STORE_KEY]) {
    g[STORE_KEY] = { recentEvents: [], lastSnapshot: null };
  }
  return g[STORE_KEY] as Store;
}

export function appendEvent(event: DisruptionEvent): void {
  const store = getStore();
  store.recentEvents = [event, ...store.recentEvents].slice(0, MAX_EVENTS);
}

export function getRecentEvents(): DisruptionEvent[] {
  // Return a defensive copy so callers can't mutate store state by reference.
  return [...getStore().recentEvents];
}

export function getEventById(id: string): DisruptionEvent | null {
  return getStore().recentEvents.find((e) => e.id === id) ?? null;
}

export function setLastSnapshot(snapshot: MonitorSnapshot): void {
  getStore().lastSnapshot = snapshot;
}

export function getLastSnapshot(): MonitorSnapshot | null {
  return getStore().lastSnapshot;
}

/** Debug / test helper. Not exposed via any route. */
export function _resetForTest(): void {
  const store = getStore();
  store.recentEvents = [];
  store.lastSnapshot = null;
}
