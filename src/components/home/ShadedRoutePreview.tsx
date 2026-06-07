"use client";

// Custom shade-aware route preview for two hand-curated demo routes.
//
// ROUTE 1 — Byrasandra Lake Walking Track (original Round 2 route)
//   Origin : Texas Instruments, Bagmane Tech Park
//   Fastest: south along Bagmane Tech Park Road
//   Shaded : east curve around Kelagiankare Lake edge (~70% canopy)
//
// ROUTE 2 — Atal Bihari Vajpayee Park, Kaggadasapura / Malleshpalya
//   Origin : Texas Instruments, Bagmane Tech Park  ← same starting pin
//   Fastest: north-west on Bagmane Tech Park Rd → CV Raman Nagar Main Rd
//            → Kaggadasapura Main Rd (direct, open road, ~18 min walk)
//   Shaded : north exit → DRDO township internal roads (tree-lined green
//            belt) → Kaggadasapura 5th Main (~70% canopy, ~21 min walk)
//
// What this is NOT (yet): live shade computation. The shaded polylines were
// hand-identified by inspecting Google Maps satellite view for tree cover.
// Round 3 will replace this with a real pipeline (OSM building footprints,
// pysolar sun-angle math, shapely shadow projection) that computes shade
// scores for arbitrary A-to-B routes across Bangalore.
//
// SVG rationale — same as before:
//   - No external tile requests = no loading flashes during demo recording.
//   - Pixel-identical on every machine.
//   - Matches Modern Indian Editorial aesthetic (ivory + terracotta + indigo).
//   - Zero API keys, demo-safe.

import { useState } from "react";
import { motion } from "framer-motion";

type RouteMode = "fastest" | "shaded";

// ─── Byrasandra Lake data (unchanged) ──────────────────────────────────────

const BYRASANDRA_COPY: Record<
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

const BYRASANDRA_FASTEST = "60,55 60,130 110,165 195,200 250,245";
const BYRASANDRA_SHADED  = "60,55 130,75 200,95 265,140 290,200 255,235 250,245";

// ─── Atal Bihari Vajpayee Park data ─────────────────────────────────────────
//
// SVG viewBox 0 0 400 280 — north is UP.
// TI gate pin kept at same relative position as Byrasandra map (60, 220)
// (bottom-left area) so the component looks consistent in the route sheet.
// Park entrance pin sits top-right at (320, 45).
//
// Fastest path  : exits north on Bagmane Tech Park Rd, turns west onto
//                 CV Raman Nagar Main Rd, then north-west on
//                 Kaggadasapura Main Rd straight to the park gate.
// Shaded path   : exits north, bends east into DRDO township internal roads
//                 (dense canopy corridor), then curves west along
//                 Kaggadasapura 5th Main into the park entrance.

const VAJPAYEE_COPY: Record<
  RouteMode,
  { label: string; caption: string; duration: string }
> = {
  fastest: {
    label: "Fastest",
    caption: "CV Raman Nagar Main Rd → Kaggadasapura Main Rd",
    duration: "18 min walk",
  },
  shaded: {
    label: "Shaded",
    caption: "~70% canopy via DRDO township green belt",
    duration: "21 min walk",
  },
};

// Hand-traced polyline points (viewBox 0 0 400 280).
// Origin  = TI gate  → (60, 220)   bottom-left
// Dest    = park gate → (320, 45)  top-right
const VAJPAYEE_FASTEST = "60,220 60,160 100,130 160,100 230,70 320,45";
const VAJPAYEE_SHADED  = "60,220 60,155 90,120 150,90 210,60 265,45 320,45";

// ─── Shared toggle component ─────────────────────────────────────────────────

function RouteToggle({
  mode,
  onChange,
  layoutId,
}: {
  mode: RouteMode;
  onChange: (m: RouteMode) => void;
  layoutId: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-black/5 px-3 py-2">
      <div className="flex gap-1 rounded-full bg-black/[0.04] p-1">
        {(["fastest", "shaded"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={`relative rounded-full px-4 py-1.5 font-montserrat text-[11px] font-semibold uppercase tracking-wider transition-colors ${
              mode === m
                ? "text-white"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {mode === m && (
              <motion.span
                layoutId={layoutId}
                className={`absolute inset-0 rounded-full ${
                  m === "shaded" ? "bg-[#C8553D]" : "bg-[#1E3A5F]"
                }`}
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative">
              {m === "fastest" ? "Fastest" : "Shaded"}
            </span>
          </button>
        ))}
      </div>
      <span className="rounded-full bg-white/70 px-2 py-1 font-montserrat text-[9px] font-semibold uppercase tracking-wider text-[#C8553D]">
        Saanjh shade engine
      </span>
    </div>
  );
}

// ─── Byrasandra Lake preview (original — unchanged) ──────────────────────────

function ByrasandraRouteMap({ mode }: { mode: RouteMode }) {
  return (
    <svg
      viewBox="0 0 400 280"
      className="block h-56 w-full"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Map from Texas Instruments to Byrasandra Lake Walking Track"
    >
      <defs>
        <linearGradient id="bgGrad-byr" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FAF6F0" />
          <stop offset="100%" stopColor="#F4EEE3" />
        </linearGradient>
        <pattern id="canopy-byr" x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="7" cy="7" r="2.5" fill="#9BB68A" opacity="0.55" />
        </pattern>
      </defs>
      <rect width="400" height="280" fill="url(#bgGrad-byr)" />

      {/* Tree canopy patches */}
      <ellipse cx="195" cy="105" rx="60" ry="22" fill="url(#canopy-byr)"
        opacity={mode === "shaded" ? 0.9 : 0.35} />
      <ellipse cx="280" cy="170" rx="40" ry="38" fill="url(#canopy-byr)"
        opacity={mode === "shaded" ? 0.9 : 0.35} />

      {/* Kelagiankare Lake */}
      <path
        d="M 230 130 Q 270 120 295 145 Q 305 175 280 195 Q 250 200 235 175 Q 225 155 230 130 Z"
        fill="#C5D9E8" opacity="0.7"
      />
      <text x="263" y="170" textAnchor="middle" fontSize="8"
        fontFamily="ui-sans-serif, system-ui" opacity="0.7" fill="#1E3A5F">
        Kelagiankare
      </text>

      {/* Road grid */}
      <g stroke="#D7CFC0" strokeWidth="3" strokeLinecap="round" fill="none">
        <line x1="0" y1="80" x2="400" y2="80" />
        <line x1="0" y1="180" x2="400" y2="180" />
        <line x1="110" y1="0" x2="110" y2="280" />
        <line x1="250" y1="0" x2="250" y2="280" />
      </g>
      <text x="55" y="95" fontSize="7" fontFamily="ui-sans-serif, system-ui" fill="#7A6F5E">
        Bagmane Tech Park Rd
      </text>

      {/* Fastest route (indigo) */}
      <polyline points={BYRASANDRA_FASTEST} fill="none" stroke="#1E3A5F"
        strokeWidth={mode === "fastest" ? 3.5 : 2} strokeLinecap="round"
        strokeLinejoin="round" strokeDasharray={mode === "fastest" ? "0" : "3 5"}
        opacity={mode === "fastest" ? 1 : 0.35} />

      {/* Shaded route (terracotta) */}
      <polyline points={BYRASANDRA_SHADED} fill="none" stroke="#C8553D"
        strokeWidth={mode === "shaded" ? 3.5 : 2} strokeLinecap="round"
        strokeLinejoin="round" strokeDasharray={mode === "shaded" ? "0" : "3 5"}
        opacity={mode === "shaded" ? 1 : 0.35} />

      {/* Origin pin */}
      <g>
        <circle cx="60" cy="55" r="7" fill="#1E3A5F" />
        <circle cx="60" cy="55" r="3" fill="#FAF6F0" />
        <text x="72" y="50" fontSize="10" fontWeight="600"
          fontFamily="ui-sans-serif, system-ui" fill="#1E3A5F">
          Texas Instruments
        </text>
      </g>

      {/* Destination pin */}
      <g>
        <circle cx="250" cy="245" r="7" fill="#C8553D" />
        <circle cx="250" cy="245" r="3" fill="#FAF6F0" />
        <text x="240" y="265" textAnchor="end" fontSize="10" fontWeight="600"
          fontFamily="ui-sans-serif, system-ui" fill="#C8553D">
          Byrasandra Lake
        </text>
      </g>
    </svg>
  );
}

// ─── Atal Bihari Vajpayee Park preview (new) ─────────────────────────────────

function VajpayeeRouteMap({ mode }: { mode: RouteMode }) {
  return (
    <svg
      viewBox="0 0 400 280"
      className="block h-56 w-full"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Map from Texas Instruments to Atal Bihari Vajpayee Park"
    >
      <defs>
        <linearGradient id="bgGrad-vaj" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FAF6F0" />
          <stop offset="100%" stopColor="#F4EEE3" />
        </linearGradient>
        {/* Dense canopy dot pattern for DRDO green belt */}
        <pattern id="canopy-vaj" x="0" y="0" width="12" height="12" patternUnits="userSpaceOnUse">
          <circle cx="6" cy="6" r="2.5" fill="#9BB68A" opacity="0.6" />
        </pattern>
      </defs>
      <rect width="400" height="280" fill="url(#bgGrad-vaj)" />

      {/* DRDO township green belt — shaded corridor (top-left to mid area) */}
      <ellipse cx="130" cy="130" rx="55" ry="38" fill="url(#canopy-vaj)"
        opacity={mode === "shaded" ? 0.95 : 0.3} />
      <ellipse cx="210" cy="85" rx="42" ry="28" fill="url(#canopy-vaj)"
        opacity={mode === "shaded" ? 0.9 : 0.3} />

      {/* Park green patch at destination */}
      <ellipse cx="310" cy="52" rx="38" ry="22" fill="#B5D4A0" opacity="0.55" />
      <text x="310" y="34" textAnchor="middle" fontSize="7"
        fontFamily="ui-sans-serif, system-ui" fill="#3A6B2A" opacity="0.85">
        Vajpayee Park
      </text>

      {/* Road grid — CV Raman Nagar layout */}
      <g stroke="#D7CFC0" strokeWidth="3" strokeLinecap="round" fill="none">
        {/* Bagmane Tech Park Road (vertical, left side) */}
        <line x1="60" y1="0" x2="60" y2="280" />
        {/* CV Raman Nagar Main Rd (horizontal, mid) */}
        <line x1="0" y1="160" x2="400" y2="160" />
        {/* Kaggadasapura Main Rd (diagonal NW) */}
        <line x1="60" y1="160" x2="320" y2="45" />
      </g>

      {/* Road labels */}
      <text x="68" y="200" fontSize="7" fontFamily="ui-sans-serif, system-ui"
        fill="#7A6F5E" transform="rotate(-90, 68, 200)">
        Bagmane Tech Park Rd
      </text>
      <text x="80" y="175" fontSize="7" fontFamily="ui-sans-serif, system-ui"
        fill="#7A6F5E">
        CV Raman Nagar Main Rd
      </text>
      <text x="148" y="118" fontSize="7" fontFamily="ui-sans-serif, system-ui"
        fill="#7A6F5E" transform="rotate(-28, 148, 118)">
        Kaggadasapura Main Rd
      </text>

      {/* Fastest route (indigo) — direct along main roads */}
      <polyline points={VAJPAYEE_FASTEST} fill="none" stroke="#1E3A5F"
        strokeWidth={mode === "fastest" ? 3.5 : 2} strokeLinecap="round"
        strokeLinejoin="round" strokeDasharray={mode === "fastest" ? "0" : "3 5"}
        opacity={mode === "fastest" ? 1 : 0.35} />

      {/* Shaded route (terracotta) — DRDO green belt internal roads */}
      <polyline points={VAJPAYEE_SHADED} fill="none" stroke="#C8553D"
        strokeWidth={mode === "shaded" ? 3.5 : 2} strokeLinecap="round"
        strokeLinejoin="round" strokeDasharray={mode === "shaded" ? "0" : "3 5"}
        opacity={mode === "shaded" ? 1 : 0.35} />

      {/* Origin pin: TI Bagmane */}
      <g>
        <circle cx="60" cy="220" r="7" fill="#1E3A5F" />
        <circle cx="60" cy="220" r="3" fill="#FAF6F0" />
        <text x="72" y="215" fontSize="10" fontWeight="600"
          fontFamily="ui-sans-serif, system-ui" fill="#1E3A5F">
          Texas Instruments
        </text>
      </g>

      {/* Destination pin: Vajpayee Park */}
      <g>
        <circle cx="320" cy="45" r="7" fill="#C8553D" />
        <circle cx="320" cy="45" r="3" fill="#FAF6F0" />
        <text x="308" y="68" textAnchor="middle" fontSize="10" fontWeight="600"
          fontFamily="ui-sans-serif, system-ui" fill="#C8553D">
          Vajpayee Park
        </text>
      </g>
    </svg>
  );
}

// ─── Public exported components ──────────────────────────────────────────────

/** Shaded route preview for Byrasandra Lake Walking Track */
function ByrasandraShadedRoutePreview({ venueName }: { venueName: string }) {
  const [mode, setMode] = useState<RouteMode>("fastest");
  const copy = BYRASANDRA_COPY[mode];

  return (
    <div className="overflow-hidden rounded-2xl border border-white/40 bg-[#FAF6F0]">
      <RouteToggle
        mode={mode}
        onChange={setMode}
        layoutId="shaded-route-toggle-bg-byr"
      />
      <div className="relative">
        <ByrasandraRouteMap mode={mode} />
      </div>
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

/** Shaded route preview for Atal Bihari Vajpayee Park */
function VajpayeeShadedRoutePreview({ venueName }: { venueName: string }) {
  const [mode, setMode] = useState<RouteMode>("fastest");
  const copy = VAJPAYEE_COPY[mode];

  return (
    <div className="overflow-hidden rounded-2xl border border-white/40 bg-[#FAF6F0]">
      <RouteToggle
        mode={mode}
        onChange={setMode}
        layoutId="shaded-route-toggle-bg-vaj"
      />
      <div className="relative">
        <VajpayeeRouteMap mode={mode} />
      </div>
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
 * Master export: picks the right hand-curated preview based on venue name.
 * Falls back gracefully to the keyless Google Maps embed (handled in
 * VenueRouteSheet) for any venue not matched here.
 */
export function ShadedRoutePreview({ venueName }: { venueName: string }) {
  const normalised = venueName.trim().toLowerCase();

  if (normalised === "atal bihari vajpayee park") {
    return <VajpayeeShadedRoutePreview venueName={venueName} />;
  }

  // Original Byrasandra route (keep as-is for any demo where it still appears)
  return <ByrasandraShadedRoutePreview venueName={venueName} />;
}

/**
 * Should the shaded preview show for this venue?
 * Round 2 ships two hand-curated routes. VenueRouteSheet calls this to decide
 * whether to render ShadedRoutePreview or fall back to the keyless iframe.
 */
export function shouldUseShadedPreview(venueName: string): boolean {
  const normalised = venueName.trim().toLowerCase();
  return (
    normalised === "byrasandra lake walking track" ||
    normalised === "atal bihari vajpayee park"
  );
}
