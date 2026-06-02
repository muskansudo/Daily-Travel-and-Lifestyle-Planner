"use client";

// Custom shade-aware route preview for Byrasandra Lake demo route.
//
// What this is: a deterministic SVG render of two pre-identified routes from
// TI Bagmane Tech Park to Byrasandra Lake Walking Track — the fastest path
// along Bagmane Tech Park Road, and a tree-canopied alternative along the
// Kelagiankare Lake edge. The user toggles between them.
//
// What this is NOT (yet): live shade computation. The shaded polyline was
// hand-identified by inspecting Google Maps satellite view for tree cover.
// Round 3 will replace this with a real pipeline (OSM building footprints,
// pysolar sun-angle math, shapely shadow projection) that computes shade
// scores for arbitrary A-to-B routes across Bangalore.
//
// SVG over Leaflet/Mapbox for this Round 2 preview because:
//   - No external tile requests = no loading flashes during demo recording.
//   - Renders pixel-identical on every machine, every run.
//   - Matches Modern Indian Editorial aesthetic (ivory + terracotta + indigo)
//     without overriding a third-party map's default styling.
//   - Zero external dependencies, zero API keys, demo-safe.

import { useState } from "react";
import { motion } from "framer-motion";

type RouteMode = "fastest" | "shaded";

const ROUTE_COPY: Record<
  RouteMode,
  { label: string; caption: string; duration: string }
> = {
  fastest: {
    label: "Fastest",
    caption: "Bagmane Tech Park Road",
    duration: "10 min walk",
  },
  shaded: {
    label: "Shaded",
    caption: "~70% canopy via Kelagiankare Lake edge",
    duration: "12 min walk",
  },
};

// Hand-traced polyline points in SVG coordinates (viewBox 0 0 400 280).
// Both paths share start (TI gate) and end (Byrasandra entrance) anchors.
// Fastest = straight south along Bagmane Tech Park Road.
// Shaded = east curve around Kelagiankare Lake, then south to the lake entrance.
const FASTEST_POINTS = "60,55 60,130 110,165 195,200 250,245";
const SHADED_POINTS = "60,55 130,75 200,95 265,140 290,200 255,235 250,245";

export function ShadedRoutePreview({ venueName }: { venueName: string }) {
  const [mode, setMode] = useState<RouteMode>("fastest");
  const copy = ROUTE_COPY[mode];

  return (
    <div className="overflow-hidden rounded-2xl border border-white/40 bg-[#FAF6F0]">
      {/* Toggle */}
      <div className="flex items-center justify-between border-b border-black/5 px-3 py-2">
        <div className="flex gap-1 rounded-full bg-black/[0.04] p-1">
          {(["fastest", "shaded"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`relative rounded-full px-4 py-1.5 font-montserrat text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                mode === m
                  ? "text-white"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {mode === m && (
                <motion.span
                  layoutId="shaded-route-toggle-bg"
                  className={`absolute inset-0 rounded-full ${
                    m === "shaded" ? "bg-[#C8553D]" : "bg-[#1E3A5F]"
                  }`}
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative">{ROUTE_COPY[m].label}</span>
            </button>
          ))}
        </div>
        <span className="rounded-full bg-white/70 px-2 py-1 font-montserrat text-[9px] font-semibold uppercase tracking-wider text-[#C8553D]">
          Saanjh shade engine
        </span>
      </div>

      {/* SVG map */}
      <div className="relative">
        <svg
          viewBox="0 0 400 280"
          className="block h-56 w-full"
          xmlns="http://www.w3.org/2000/svg"
          aria-label={`Map from Texas Instruments to ${venueName}`}
        >
          {/* Soft ivory background gradient */}
          <defs>
            <linearGradient id="bgGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FAF6F0" />
              <stop offset="100%" stopColor="#F4EEE3" />
            </linearGradient>
            <pattern
              id="canopy"
              x="0"
              y="0"
              width="14"
              height="14"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="7" cy="7" r="2.5" fill="#9BB68A" opacity="0.55" />
            </pattern>
          </defs>
          <rect width="400" height="280" fill="url(#bgGradient)" />

          {/* Tree canopy patches along the shaded corridor (subtle visual cue) */}
          <ellipse
            cx="195"
            cy="105"
            rx="60"
            ry="22"
            fill="url(#canopy)"
            opacity={mode === "shaded" ? 0.9 : 0.35}
          />
          <ellipse
            cx="280"
            cy="170"
            rx="40"
            ry="38"
            fill="url(#canopy)"
            opacity={mode === "shaded" ? 0.9 : 0.35}
          />

          {/* Kelagiankare Lake silhouette */}
          <path
            d="M 230 130 Q 270 120 295 145 Q 305 175 280 195 Q 250 200 235 175 Q 225 155 230 130 Z"
            fill="#C5D9E8"
            opacity="0.7"
          />
          <text
            x="263"
            y="170"
            textAnchor="middle"
            className="fill-[#1E3A5F]"
            fontSize="8"
            fontFamily="ui-sans-serif, system-ui"
            opacity="0.7"
          >
            Kelagiankare
          </text>

          {/* Simplified road grid */}
          <g stroke="#D7CFC0" strokeWidth="3" strokeLinecap="round" fill="none">
            <line x1="0" y1="80" x2="400" y2="80" />
            <line x1="0" y1="180" x2="400" y2="180" />
            <line x1="110" y1="0" x2="110" y2="280" />
            <line x1="250" y1="0" x2="250" y2="280" />
          </g>
          <text
            x="55"
            y="95"
            className="fill-[#7A6F5E]"
            fontSize="7"
            fontFamily="ui-sans-serif, system-ui"
          >
            Bagmane Tech Park Rd
          </text>

          {/* Fastest route (indigo) */}
          <polyline
            points={FASTEST_POINTS}
            fill="none"
            stroke="#1E3A5F"
            strokeWidth={mode === "fastest" ? 3.5 : 2}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={mode === "fastest" ? "0" : "3 5"}
            opacity={mode === "fastest" ? 1 : 0.35}
          />

          {/* Shaded route (terracotta) */}
          <polyline
            points={SHADED_POINTS}
            fill="none"
            stroke="#C8553D"
            strokeWidth={mode === "shaded" ? 3.5 : 2}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={mode === "shaded" ? "0" : "3 5"}
            opacity={mode === "shaded" ? 1 : 0.35}
          />

          {/* Origin pin: TI Bagmane */}
          <g>
            <circle cx="60" cy="55" r="7" fill="#1E3A5F" />
            <circle cx="60" cy="55" r="3" fill="#FAF6F0" />
            <text
              x="72"
              y="50"
              className="fill-[#1E3A5F]"
              fontSize="10"
              fontWeight="600"
              fontFamily="ui-sans-serif, system-ui"
            >
              Texas Instruments
            </text>
          </g>

          {/* Destination pin: Byrasandra Lake */}
          <g>
            <circle cx="250" cy="245" r="7" fill="#C8553D" />
            <circle cx="250" cy="245" r="3" fill="#FAF6F0" />
            <text
              x="240"
              y="265"
              textAnchor="end"
              className="fill-[#C8553D]"
              fontSize="10"
              fontWeight="600"
              fontFamily="ui-sans-serif, system-ui"
            >
              Byrasandra Lake
            </text>
          </g>
        </svg>
      </div>

      {/* Caption */}
      <div className="flex items-center justify-between border-t border-black/5 px-4 py-3">
        <p className="font-montserrat text-[11px] text-on-surface-variant">
          {copy.caption}
        </p>
        <p className="font-montserrat text-[11px] font-semibold text-on-surface">
          {copy.duration}
        </p>
      </div>
    </div>
  );
}

/**
 * Should the shaded preview show for this venue? Round 2 ships only one
 * hand-curated route. We match by name so a DB id refresh doesn't break this.
 */
export function shouldUseShadedPreview(venueName: string): boolean {
  return venueName.trim().toLowerCase() === "byrasandra lake walking track";
}
