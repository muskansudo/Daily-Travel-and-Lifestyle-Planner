"use client";

// AgentStatusBar
//
// Two jobs:
//   1. Show a green pulsing "Saanjh is watching" dot + last poll timestamp.
//   2. Expose three "Simulate disruption" buttons for the demo.
//
// This component mounts the useAgentMonitor hook. Only mount it once, at the
// top of HomePageClient, so there is one polling loop for the whole page.
//
// Props:
//   onDisruption(eventId) — called when a real poll fires a disruption OR
//                           when the user taps a simulate button. The parent
//                           opens the ReasoningTracePanel with this eventId.

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAgentMonitor } from "@/components/agent/useAgentMonitor";

interface AgentStatusBarProps {
  onDisruption: (eventId: string) => void;
}

type SimulateType = "aqi_spike" | "rain" | "calendar_cancel" | "location_change" | "heat_alert";

const SIMULATE_BUTTONS: {
  type: SimulateType;
  label: string;
  icon: string;
}[] = [
  { type: "aqi_spike", label: "AQI Spike", icon: "air" },
  { type: "rain", label: "Rain", icon: "rainy" },
  { type: "heat_alert", label: "Heat Alert", icon: "thermometer" },
  { type: "calendar_cancel", label: "Plans Freed", icon: "event_available" },
  { type: "location_change", label: "Location Change", icon: "location_on" },
];

const SIMULATE_PAYLOADS: Record<SimulateType, object> = {
  aqi_spike: {
    type: "aqi_spike",
    previous: 92,
    current: 168,
    delta: 76,
    location: { lat: 12.9716, lng: 77.5946 },
  },
  rain: {
    type: "rain",
    condition: "Rain",
    location: { lat: 12.9716, lng: 77.5946 },
    window: {
      start: new Date().toISOString(),
      end: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    },
  },
  heat_alert: {
    type: "heat_alert",
    temperatureC: 41,
    location: { lat: 12.9716, lng: 77.5946 },
    window: {
      start: new Date().toISOString(),
      end: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    },
  },
  calendar_cancel: {
    type: "calendar_cancel",
    eventId: "demo-event-1",
    eventTitle: "Work block ended early",
    originalSlot: {
      start: new Date().toISOString(),
      end: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
  },
  location_change: {
    type: "location_change",
    previous: { lat: 12.9876, lng: 77.6926 },
    current: { lat: 12.9352, lng: 77.6245 },
    distanceKm: 6.2,
  },
};

export function AgentStatusBar({ onDisruption }: AgentStatusBarProps) {
  const monitor = useAgentMonitor();
  const [simulating, setSimulating] = useState<SimulateType | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleSimulate = useCallback(
    async (type: SimulateType) => {
      if (simulating) return;
      setSimulating(type);
      try {
        const res = await fetch("/api/agent/simulate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            payload: SIMULATE_PAYLOADS[type],
          }),
        });
        if (!res.ok) throw new Error("Simulate failed");
        const data = (await res.json()) as { eventId: string };
        onDisruption(data.eventId);
      } catch {
        // Silent — the status bar is not a critical path.
      } finally {
        setSimulating(null);
      }
    },
    [simulating, onDisruption]
  );

  const lastPollLabel = monitor.lastPoll
    ? new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date(monitor.lastPoll))
    : null;

  return (
    <div className="rounded-2xl glass-panel silk-border px-4 py-3 space-y-3">
      {/* Top row: status dot + expand toggle */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between"
      >
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
          </span>
          <span className="font-montserrat text-xs font-semibold text-on-surface">
            Saanjh is watching
          </span>
          {lastPollLabel && (
            <span className="font-montserrat text-[10px] text-on-surface-variant">
              · last poll {lastPollLabel}
            </span>
          )}
        </div>
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
          {expanded ? "expand_less" : "expand_more"}
        </span>
      </button>

      {/* Simulate buttons — collapsible */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="buttons"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <p className="font-montserrat text-[10px] uppercase tracking-widest text-on-surface-variant pb-2">
              Simulate disruption
            </p>
            <div className="flex gap-2 flex-wrap">
              {SIMULATE_BUTTONS.map(({ type, label, icon }) => (
                <button
                  key={type}
                  type="button"
                  disabled={simulating !== null}
                  onClick={() => void handleSimulate(type)}
                  className="flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container px-3 py-1.5 font-montserrat text-[11px] font-semibold text-on-surface transition-colors hover:bg-surface-container-high disabled:opacity-50"
                >
                  {simulating === type ? (
                    <span className="material-symbols-outlined animate-spin text-[14px]">
                      progress_activity
                    </span>
                  ) : (
                    <span className="material-symbols-outlined text-[14px]">
                      {icon}
                    </span>
                  )}
                  {label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
