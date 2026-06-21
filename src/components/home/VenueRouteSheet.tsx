"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { VenueRecommendation } from "@/lib/types/home";
import {
  backdropVariants,
  sheetVariants,
} from "./animations";
import { ShadeRouteMap } from "./ShadeRouteMap";
import { DEFAULT_BIAS_LATLNG } from "@/lib/constants/venues";

const TRANSPORT_LABELS = {
  walking: { label: "Walking", icon: "directions_walk" },
  driving: { label: "Driving", icon: "directions_car" },
  transit: { label: "Transit", icon: "directions_transit" },
} as const;

// Real Google Maps embed. Keyless: the `output=embed` endpoint renders a live
// map of a text query with no API key. We pass the venue NAME (+ neighbourhood
// + city) rather than stored lat/lng, so Google's own geocoding resolves the
// real place even if our manually-entered coordinates are off.
function RouteMapPreview({
  embedUrl,
  venueName,
}: {
  embedUrl: string;
  venueName: string;
}) {
  return (
    <div className="relative h-56 overflow-hidden rounded-2xl border border-white/40 bg-surface-container-low">
      <iframe
        title={`Map of ${venueName}`}
        src={embedUrl}
        className="h-full w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
      <div className="pointer-events-none absolute right-3 top-3 max-w-[160px] truncate rounded-full bg-white/85 px-3 py-1 font-montserrat text-[10px] font-semibold uppercase tracking-wider text-tertiary backdrop-blur-sm">
        {venueName}
      </div>
    </div>
  );
}

export function VenueRouteSheet({
  venue,
  open,
  onClose,
}: {
  venue: VenueRecommendation | null;
  open: boolean;
  onClose: () => void;
}) {
  // When the shade API reports the venue is outside the precomputed graph,
  // we fall back to the plain Google Maps embed instead of the shade map.
  const [shadeUnavailable, setShadeUnavailable] = useState(false);

  // Reset the fallback whenever the venue changes, so a new venue gets a fresh
  // shot at the shade map.
  const venueId = venue?.id ?? null;
  useEffect(() => {
    setShadeUnavailable(false);
  }, [venueId]);

  if (!venue) return null;

  const transport = TRANSPORT_LABELS[venue.route.transportMode];

  // Keyless Google Maps URLs built from the venue NAME, not stored coordinates.
  // Google geocodes the text, so a slightly-wrong DB lat/lng can't misroute us.
  const mapsQuery = encodeURIComponent(
    `${venue.name} ${venue.location.address} Bangalore`
  );
  const embedUrl = `https://maps.google.com/maps?q=${mapsQuery}&z=15&output=embed`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${mapsQuery}&travelmode=${venue.route.transportMode}`;

  const openDirections = () => {
    window.open(directionsUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="route-backdrop"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            key="route-sheet"
            variants={sheetVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-x-0 bottom-0 z-[61] mx-auto max-h-[90dvh] max-w-[600px] overflow-hidden rounded-t-3xl border border-white/40 bg-surface/95 shadow-glow-lg backdrop-blur-2xl"
          >
            <div className="flex justify-center py-3">
              <div className="h-1 w-10 rounded-full bg-outline-variant/60" />
            </div>

            <div className="flex items-start justify-between px-6 pb-4">
              <div>
                <h2 className="font-playfair text-xl font-semibold text-on-surface">
                  Route to {venue.name}
                </h2>
                <p className="mt-0.5 font-montserrat text-xs text-on-surface-variant">
                  {venue.location.address}
                </p>
              </div>
              <motion.button
                whileTap={{ scale: 0.9 }}
                type="button"
                onClick={onClose}
                className="rounded-full p-2 hover:bg-white/20"
                aria-label="Close route"
              >
                <span className="material-symbols-outlined text-on-surface-variant">
                  close
                </span>
              </motion.button>
            </div>

            <div className="no-scrollbar max-h-[calc(90dvh-180px)] overflow-y-auto px-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {/* Bagmane / ORR venues get the real shade-aware Mapbox route
                  (graph precomputed by scripts/build-shade-graph.ts, served
                  by /api/route/shaded). Venues outside the covered bbox fall
                  back to the keyless Google Maps embed — we don't pretend
                  coverage exists where it doesn't. */}
              {/* Every venue card currently carries DEFAULT_BIAS_LATLNG as its
                  location (the home plan stamps the bias point on all stops),
                  so we can't gate on venue.location coords — they're all the
                  same point. Instead we pass the venue id and let
                  /api/route/shaded resolve the real coordinates from the
                  venues table. The route endpoint returns graph_unavailable
                  for venues outside the Bagmane/ORR shade graph (e.g.
                  Whitefield, Koramangala); for those we swap in the plain
                  Google Maps embed rather than drawing a misleading shaded
                  route to the graph boundary. */}
              {shadeUnavailable ? (
                <RouteMapPreview embedUrl={embedUrl} venueName={venue.name} />
              ) : (
                <ShadeRouteMap
                  origin={DEFAULT_BIAS_LATLNG}
                  destination={{
                    lat: venue.location.lat,
                    lng: venue.location.lng,
                  }}
                  venueName={venue.name}
                  venueId={venue.id}
                  onGraphUnavailable={() => setShadeUnavailable(true)}
                />
              )}

              {/* Mode is a real value (passed through to Google Maps). ETA,
                  distance, and turn-by-turn directions are deferred to Stage 3
                  (Google Directions/Routes API + geolocation) — Google Maps
                  shows the real numbers once the user taps Start Navigation. */}
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/40 bg-white/40 px-4 py-3">
                <span className="material-symbols-outlined text-primary">
                  {transport.icon}
                </span>
                <div>
                  <p className="font-montserrat text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                    Suggested mode
                  </p>
                  <p className="font-montserrat text-sm font-semibold text-on-surface">
                    {transport.label} to {venue.location.address}
                  </p>
                </div>
              </div>

              <motion.button
                type="button"
                onClick={openDirections}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                className="btn-premium mt-6 flex w-full items-center justify-center gap-2 rounded-full py-4 font-montserrat text-sm font-semibold uppercase tracking-wider"
              >
                <span className="material-symbols-outlined text-[20px]">
                  navigation
                </span>
                Start Navigation
              </motion.button>
              <p className="mt-2 text-center font-montserrat text-[11px] text-on-surface-variant/60">
                Opens directions in Google Maps
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
