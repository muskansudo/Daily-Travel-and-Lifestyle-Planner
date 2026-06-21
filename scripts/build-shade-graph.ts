/* eslint-disable @typescript-eslint/no-explicit-any */
// scripts/build-shade-graph.ts
//
// OFFLINE pipeline — run once on the laptop. Populates `road_nodes` and
// `road_segments` in Supabase for the Bagmane / ORR neighborhood.
//
// Pipeline:
//   5a. Roads: fetch OSM road network via Overpass for the bbox. Cache raw
//       JSON to scripts/data/osm-roads.json so reruns don't re-download.
//       Buildings: load Google Open Buildings V3 + Open Buildings Temporal V1
//       heights from scripts/data/bagmane-buildings.geojson (exported via
//       Google Earth Engine). This dataset is much denser than OSM building
//       footprints in Bangalore (34k+ buildings vs ~2-3k in OSM for the same
//       bbox) and ships pre-joined heights from a satellite-derived model.
//   5b. Build the road graph: collect nodes referenced by road ways, then
//       emit one edge per consecutive node pair on each way. Deduplicate.
//   5c. Project shadows for each building polygon at 4 IST times (08/12/15/18)
//       on 2026-05-15 using suncalc for sun azimuth + altitude. Shadow length
//       = height / tan(altitude); cast OPPOSITE the sun azimuth; shadow
//       polygon = convex hull of (footprint ∪ translated footprint). Building
//       height = EE `height_m` property → fallback 9m (3 floors) if missing.
//   5d. Score each segment per bucket: sample at ~5m intervals, count points
//       inside any shadow polygon → fraction in shade ∈ [0,1].
//   5e. Upsert nodes + segments to Supabase in batches of 500.
//
// Run with:
//   npx tsx scripts/build-shade-graph.ts
//
// Requires:
//   - .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
//   - scripts/data/bagmane-buildings.geojson (Earth Engine export, 17 MB)

import * as fs from "fs";
import * as path from "path";
import * as turf from "@turf/turf";
import * as SunCalc from "suncalc";
import { createClient } from "@supabase/supabase-js";
import type { Feature, Polygon } from "geojson";

// ─── Load .env.local manually (no dotenv dep added in package.json) ─────────
function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnvLocal();

// ─── Constants from spec ─────────────────────────────────────────────────────
const NEIGHBORHOOD = "bagmane_orr";
const BBOX = { south: 12.9699, west: 77.6574, north: 13.0018, east: 77.6966 };
const BBOX_CENTER = {
  lat: (BBOX.south + BBOX.north) / 2,
  lng: (BBOX.west + BBOX.east) / 2,
};

// One representative clear summer day. Sun position computed at the bbox
// center; the area is ~2.6 × 3.4 km so a single sun vector per bucket is
// defensible (documented in spec §5c).
const REFERENCE_DATE = "2026-05-15";

type Bucket = "morning" | "noon" | "afternoon" | "evening";
const BUCKETS: { name: Bucket; hourIST: number }[] = [
  { name: "morning", hourIST: 8 },
  { name: "noon", hourIST: 12 },
  { name: "afternoon", hourIST: 15 },
  { name: "evening", hourIST: 18 },
];

const OVERPASS_ENDPOINTS = [
  // private.coffee (formerly Kumi Systems) — generous policy, no published
  // request limits. Best primary endpoint for this kind of one-time export.
  "https://overpass.private.coffee/api/interpreter",
  // Round-robin pool — main upstream, working but rate-limited.
  "https://lz4.overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
  // VK Maps (mail.ru) Russian mirror — no published limits.
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  // Generic alias that round-robins to lz4/z. Listed last as it's just
  // another path to the same congested servers.
  "https://overpass-api.de/api/interpreter",
];
const OVERPASS_QUERY = `
[out:json][timeout:60];
(
  way["highway"~"^(residential|tertiary|secondary|primary|unclassified|living_street|footway|pedestrian|service)$"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
);
(._;>;);
out body;
`.trim();

const RAW_CACHE_PATH = path.resolve(
  process.cwd(),
  "scripts/data/osm-roads.json"
);
const BUILDINGS_GEOJSON_PATH = path.resolve(
  process.cwd(),
  "scripts/data/bagmane-buildings.geojson"
);

// ─── Logging helper ──────────────────────────────────────────────────────────
function log(stage: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${stage}] ${msg}`);
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface OsmNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
}
interface OsmWay {
  type: "way";
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
}
type OsmElement = OsmNode | OsmWay;
interface OsmResponse {
  elements: OsmElement[];
}

interface NodeRow {
  id: number;
  lat: number;
  lng: number;
  neighborhood: string;
}
interface SegmentRow {
  from_node: number;
  to_node: number;
  length_m: number;
  shade_morning: number;
  shade_noon: number;
  shade_afternoon: number;
  shade_evening: number;
  neighborhood: string;
}

// ─── 5a. Fetch OSM via Overpass ──────────────────────────────────────────────
async function fetchOsm(): Promise<OsmResponse> {
  if (fs.existsSync(RAW_CACHE_PATH)) {
    log("5a", `cache hit → ${RAW_CACHE_PATH}`);
    const raw = fs.readFileSync(RAW_CACHE_PATH, "utf8");
    return JSON.parse(raw);
  }

  fs.mkdirSync(path.dirname(RAW_CACHE_PATH), { recursive: true });

  // Overpass headers note: the main server (overpass-api.de) has been
  // returning 406 Not Acceptable to requests that look like bare programmatic
  // clients. Use a descriptive User-Agent (per the Overpass usage policy),
  // explicit Accept header, and the standard form-encoded body that the
  // documented API expects. If the main server still rejects us, fall back
  // to mirrors that have looser policies.
  const HEADERS: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
    "User-Agent":
      "Saanjh-Shade-Pipeline/1.0 (academic; IGDTUW WiSE@TI hackathon; contact varnika.sharma@igdtuw.ac.in)",
  };

  let lastErr: unknown = null;
  const MAX_ATTEMPTS = OVERPASS_ENDPOINTS.length * 2; // two passes
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const url = OVERPASS_ENDPOINTS[(attempt - 1) % OVERPASS_ENDPOINTS.length];
    const shortName = url.replace(/^https?:\/\//, "").split("/")[0];
    log("5a", `Overpass POST (attempt ${attempt}/${MAX_ATTEMPTS}) → ${shortName}...`);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: HEADERS,
        body: "data=" + encodeURIComponent(OVERPASS_QUERY),
      });
      if (res.status === 429 || res.status === 504 || res.status === 406) {
        log(
          "5a",
          `${shortName} returned ${res.status} ${res.statusText}, trying next endpoint in 5s...`
        );
        await new Promise((r) => setTimeout(r, 5_000));
        continue;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `Overpass ${res.status} ${res.statusText} from ${shortName}${
            body ? ` — ${body.slice(0, 200)}` : ""
          }`
        );
      }
      const json = (await res.json()) as OsmResponse;
      fs.writeFileSync(RAW_CACHE_PATH, JSON.stringify(json));
      log(
        "5a",
        `saved raw → ${RAW_CACHE_PATH} (${json.elements.length} elements from ${shortName})`
      );
      return json;
    } catch (err) {
      lastErr = err;
      log("5a", `error: ${(err as Error).message}, retry in 5s`);
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }
  throw new Error(`Overpass failed after ${MAX_ATTEMPTS} attempts: ${String(lastErr)}`);
}

// ─── 5b. Build road graph ────────────────────────────────────────────────────
const ROAD_HIGHWAY_VALUES = new Set([
  "residential",
  "tertiary",
  "secondary",
  "primary",
  "unclassified",
  "living_street",
  "footway",
  "pedestrian",
  "service",
]);

interface RoadGraph {
  nodes: Map<number, { lat: number; lng: number }>;
  segments: Array<{ a: number; b: number; length_m: number }>;
}

function buildRoadGraph(osm: OsmResponse): RoadGraph {
  const allNodes = new Map<number, { lat: number; lng: number }>();
  for (const el of osm.elements) {
    if (el.type === "node") {
      allNodes.set(el.id, { lat: el.lat, lng: el.lon });
    }
  }
  log("5b", `OSM nodes total: ${allNodes.size}`);

  const roadWays: OsmWay[] = [];
  for (const el of osm.elements) {
    if (el.type !== "way") continue;
    const hw = el.tags?.highway;
    if (hw && ROAD_HIGHWAY_VALUES.has(hw)) roadWays.push(el);
  }
  log("5b", `road ways: ${roadWays.length}`);

  const usedNodes = new Set<number>();
  const seenEdges = new Set<string>();
  const segments: Array<{ a: number; b: number; length_m: number }> = [];

  const edgeKey = (a: number, b: number) =>
    a < b ? `${a}_${b}` : `${b}_${a}`;

  for (const way of roadWays) {
    for (let i = 0; i < way.nodes.length - 1; i++) {
      const a = way.nodes[i];
      const b = way.nodes[i + 1];
      const key = edgeKey(a, b);
      if (seenEdges.has(key)) continue;
      const na = allNodes.get(a);
      const nb = allNodes.get(b);
      if (!na || !nb) continue;
      const length_m = turf.distance(
        turf.point([na.lng, na.lat]),
        turf.point([nb.lng, nb.lat]),
        { units: "meters" }
      );
      segments.push({ a, b, length_m });
      seenEdges.add(key);
      usedNodes.add(a);
      usedNodes.add(b);
    }
  }

  const nodes = new Map<number, { lat: number; lng: number }>();
  usedNodes.forEach((id) => {
    const n = allNodes.get(id);
    if (n) nodes.set(id, n);
  });

  log(
    "5b",
    `road graph: ${nodes.size} nodes, ${segments.length} segments (undirected, deduped)`
  );
  return { nodes, segments };
}

// ─── 5c. Shadow projection ───────────────────────────────────────────────────
// Building polygons + heights from Google Open Buildings V3 (polygons) +
// Open Buildings Temporal V1 (heights, 2023 mosaic). Exported via Earth
// Engine to scripts/data/bagmane-buildings.geojson. Height resolution:
//   1) feature.properties.height_m (real number) — present on the vast
//      majority of buildings in this dataset
//   2) default 9 m (3 floors) if missing or non-finite — documented fallback
function parseEEHeight(props: Record<string, unknown> | undefined): number {
  if (!props) return 9;
  const raw = props.height_m;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  // EE sometimes serializes null when reduceRegion has no pixels overlapping
  // the polygon. Treat as missing.
  return 9;
}

interface BuildingFootprint {
  // ring of [lng,lat] coords (closed)
  ring: [number, number][];
  height_m: number;
}

interface EEFeature {
  type: "Feature";
  properties?: Record<string, unknown> | null;
  geometry: {
    type: "Polygon" | "MultiPolygon";
    // For Polygon: [ring][point][lng,lat]
    // For MultiPolygon: [polygon][ring][point][lng,lat]
    coordinates: any;
  };
}

interface EEFeatureCollection {
  type: "FeatureCollection";
  features: EEFeature[];
}

function ringFromCoords(rawRing: [number, number][]): [number, number][] | null {
  if (!Array.isArray(rawRing) || rawRing.length < 3) return null;
  const ring: [number, number][] = rawRing.map((p) => [p[0], p[1]]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }
  if (ring.length < 4) return null;
  return ring;
}

function loadBuildingsFromGeoJSON(): BuildingFootprint[] {
  if (!fs.existsSync(BUILDINGS_GEOJSON_PATH)) {
    throw new Error(
      `Missing buildings GeoJSON at ${BUILDINGS_GEOJSON_PATH}. Run the Earth Engine script and download to scripts/data/bagmane-buildings.geojson.`
    );
  }
  const sizeMB = (fs.statSync(BUILDINGS_GEOJSON_PATH).size / 1_048_576).toFixed(1);
  log("5c", `loading buildings GeoJSON (${sizeMB} MB)...`);
  const raw = fs.readFileSync(BUILDINGS_GEOJSON_PATH, "utf8");
  const fc = JSON.parse(raw) as EEFeatureCollection;
  if (fc.type !== "FeatureCollection" || !Array.isArray(fc.features)) {
    throw new Error("Buildings GeoJSON is not a FeatureCollection");
  }

  const buildings: BuildingFootprint[] = [];
  let withHeight = 0;
  let defaultedHeight = 0;
  let skipped = 0;

  for (const feat of fc.features) {
    const props = (feat.properties ?? undefined) as
      | Record<string, unknown>
      | undefined;
    const rawHeight = props?.height_m;
    const hasRealHeight =
      typeof rawHeight === "number" && Number.isFinite(rawHeight) && rawHeight > 0;
    const height_m = parseEEHeight(props);

    const geom = feat.geometry;
    if (!geom) {
      skipped++;
      continue;
    }

    const polys: [number, number][][][] =
      geom.type === "Polygon"
        ? [geom.coordinates as [number, number][][]]
        : geom.type === "MultiPolygon"
        ? (geom.coordinates as [number, number][][][])
        : [];

    for (const poly of polys) {
      // Outer ring is poly[0]; we ignore holes for shadow projection (holes
      // inside a building don't change its shadow footprint meaningfully).
      const outer = poly[0];
      const ring = ringFromCoords(outer);
      if (!ring) {
        skipped++;
        continue;
      }
      buildings.push({ ring, height_m });
      if (hasRealHeight) withHeight++;
      else defaultedHeight++;
    }
  }

  log(
    "5c",
    `loaded ${buildings.length} building footprints (${withHeight} with EE height, ${defaultedHeight} defaulted to 9m, ${skipped} skipped)`
  );
  return buildings;
}

// Meters → degrees conversion at a given latitude.
function metersToDegrees(
  dxMeters: number,
  dyMeters: number,
  refLat: number
): { dLng: number; dLat: number } {
  const dLat = dyMeters / 111_320;
  const dLng = dxMeters / (111_320 * Math.cos((refLat * Math.PI) / 180));
  return { dLng, dLat };
}

// suncalc returns:
//   altitude: radians above horizon (negative = below)
//   azimuth : radians clockwise from south (https://github.com/mourner/suncalc)
//             So 0 = sun is due south, π/2 = west, -π/2 = east, π = north.
// We want the SHADOW direction, which is opposite the sun direction.
// Convert azimuth to a unit vector (dx_east, dy_north) pointing TOWARD the sun:
//   sun_east  =  sin(azimuth + π)  → wait, no. suncalc's azimuth is "from
//   south, clockwise". South unit vector is (0,-1). Rotating clockwise by
//   azimuth gives sun direction (East, North):
//     sun_east  = -sin(azimuth)   (counter-intuitive sign because clockwise
//                                  from south puts west at +azimuth)
//     sun_north = -cos(azimuth)
//
// Sanity: at noon in Bangalore in May the sun is close to overhead and a
// little to the north (Bangalore is south of the Tropic of Cancer in May).
// We just need shadow_east = -sun_east, shadow_north = -sun_north.
//
// We'll verify empirically by printing sample shadow lengths and directions
// for a few buildings during the run.

function shadowOffsetMeters(
  altRad: number,
  azRad: number,
  height_m: number
): { dxEast: number; dyNorth: number } {
  // Sun direction (toward the sun, projected onto ground):
  const sunEast = -Math.sin(azRad);
  const sunNorth = -Math.cos(azRad);
  // Shadow direction is OPPOSITE.
  const shadowEast = -sunEast;
  const shadowNorth = -sunNorth;
  const length = height_m / Math.tan(altRad);
  return {
    dxEast: shadowEast * length,
    dyNorth: shadowNorth * length,
  };
}

function projectBuildingShadow(
  b: BuildingFootprint,
  altRad: number,
  azRad: number
): Feature<Polygon> | null {
  if (altRad <= 0) return null; // sun below horizon → no useful shadow
  const { dxEast, dyNorth } = shadowOffsetMeters(altRad, azRad, b.height_m);
  if (!Number.isFinite(dxEast) || !Number.isFinite(dyNorth)) return null;
  // Convert offset to degrees at building centroid latitude.
  const refLat = b.ring[0][1];
  const { dLng, dLat } = metersToDegrees(dxEast, dyNorth, refLat);
  const translated: [number, number][] = b.ring.map(([lng, lat]) => [
    lng + dLng,
    lat + dLat,
  ]);
  // Convex hull of footprint ∪ translated footprint. Simpler than a swept
  // sweep polygon, good enough for shade scoring (slightly overestimates at
  // concave footprints; documented in spec).
  const pointsFc = turf.featureCollection(
    [...b.ring, ...translated].map((c) => turf.point(c))
  );
  try {
    const hull = turf.convex(pointsFc);
    if (!hull) return null;
    return hull as Feature<Polygon>;
  } catch {
    return null;
  }
}

function buildShadowsForBucket(
  buildings: BuildingFootprint[],
  bucket: Bucket,
  hourIST: number
): Feature<Polygon>[] {
  // IST = UTC+5:30. To get the UTC Date for a given IST hour-of-day on
  // REFERENCE_DATE, subtract 5h30m.
  const [y, mo, d] = REFERENCE_DATE.split("-").map(Number);
  const utcHour = hourIST - 5.5; // may go negative for early IST hours; handle
  const utcDate = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0));
  utcDate.setUTCMinutes(utcDate.getUTCMinutes() + utcHour * 60);

  const sun = SunCalc.getPosition(utcDate, BBOX_CENTER.lat, BBOX_CENTER.lng);
  const altDeg = (sun.altitude * 180) / Math.PI;
  const azDeg = (sun.azimuth * 180) / Math.PI;
  log(
    "5c",
    `${bucket} ${hourIST}:00 IST → sun altitude ${altDeg.toFixed(
      2
    )}° azimuth ${azDeg.toFixed(2)}° (suncalc convention: from south, CW)`
  );

  if (sun.altitude <= 0) {
    log("5c", `${bucket}: sun below horizon, no shadows`);
    return [];
  }

  const shadows: Feature<Polygon>[] = [];
  for (const b of buildings) {
    const s = projectBuildingShadow(b, sun.altitude, sun.azimuth);
    if (s) shadows.push(s);
  }
  // Sample diagnostic: shadow length for a 9m default building
  const sampleLen = 9 / Math.tan(sun.altitude);
  log(
    "5c",
    `${bucket}: ${shadows.length}/${buildings.length} shadow polys (sample 9m-bldg shadow length ≈ ${sampleLen.toFixed(
      1
    )}m)`
  );
  return shadows;
}

// ─── 5d. Score segments per bucket ───────────────────────────────────────────
// For each segment, sample every ~5m along its length and check whether each
// sample point is inside ANY shadow polygon for the bucket. Shade score =
// (points inside) / (total points). Clamped to [0,1], rounded to 3 decimals.
//
// With 34k+ buildings (Google Open Buildings is dense), a linear scan over
// all shadows per sample point is too slow. We build a uniform-grid spatial
// index per bucket: bin each shadow by the grid cells its bbox overlaps,
// then for each sample point look up just that cell's shadows. Grid cell
// size ~50m gives a small cells-per-shadow expected value and a small
// shadows-per-cell expected value — the right tradeoff for this density.

// Grid cell size ~50m. At Bangalore latitude, 1° lat ≈ 110.6 km so ~50m
// is ~0.00045°. Use the same step for lng (the small distortion at lat 13°
// is irrelevant for binning).
const GRID_CELL_DEG = 0.00045;

interface ShadowIndex {
  // cellKey "i,j" → array of shadow polygons whose bbox touches that cell
  cells: Map<string, Feature<Polygon>[]>;
}

function cellKey(i: number, j: number): string {
  return `${i},${j}`;
}

function buildShadowIndex(shadows: Feature<Polygon>[]): ShadowIndex {
  const cells = new Map<string, Feature<Polygon>[]>();
  for (const s of shadows) {
    const bbox = turf.bbox(s); // [minLng, minLat, maxLng, maxLat]
    const i0 = Math.floor(bbox[0] / GRID_CELL_DEG);
    const j0 = Math.floor(bbox[1] / GRID_CELL_DEG);
    const i1 = Math.floor(bbox[2] / GRID_CELL_DEG);
    const j1 = Math.floor(bbox[3] / GRID_CELL_DEG);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = cellKey(i, j);
        const arr = cells.get(k);
        if (arr) arr.push(s);
        else cells.set(k, [s]);
      }
    }
  }
  return { cells };
}

function pointInAnyShadow(
  lat: number,
  lng: number,
  index: ShadowIndex
): boolean {
  const i = Math.floor(lng / GRID_CELL_DEG);
  const j = Math.floor(lat / GRID_CELL_DEG);
  const candidates = index.cells.get(cellKey(i, j));
  if (!candidates) return false;
  const pt = turf.point([lng, lat]);
  for (const poly of candidates) {
    if (turf.booleanPointInPolygon(pt, poly)) return true;
  }
  return false;
}

function scoreSegment(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  length_m: number,
  index: ShadowIndex | null
): number {
  if (!index || index.cells.size === 0) return 0;
  // ~5m sampling, capped to keep small segments cheap and giant ones bounded
  const nSamples = Math.max(2, Math.min(40, Math.ceil(length_m / 5)));
  let inside = 0;
  for (let i = 0; i <= nSamples; i++) {
    const t = i / nSamples;
    const lat = fromLat + (toLat - fromLat) * t;
    const lng = fromLng + (toLng - fromLng) * t;
    if (pointInAnyShadow(lat, lng, index)) inside++;
  }
  const score = inside / (nSamples + 1);
  return Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));
}

// ─── 5e. Write to Supabase in batches ────────────────────────────────────────
const UPSERT_BATCH = 500;

// ─── main ────────────────────────────────────────────────────────────────────
async function main() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 5a — roads from Overpass (cached on disk)
  const osm = await fetchOsm();

  // 5b — build road graph
  const graph = buildRoadGraph(osm);

  // 5c — buildings from Earth Engine GeoJSON, then shadows per bucket
  const buildings = loadBuildingsFromGeoJSON();
  if (buildings.length === 0) {
    log("5c", "WARNING: no buildings loaded — all shade scores will be 0");
  }
  const heightStats = buildings.reduce(
    (acc, b) => {
      acc.sum += b.height_m;
      acc.min = Math.min(acc.min, b.height_m);
      acc.max = Math.max(acc.max, b.height_m);
      return acc;
    },
    { sum: 0, min: Infinity, max: -Infinity }
  );
  if (buildings.length) {
    log(
      "5c",
      `heights: min ${heightStats.min.toFixed(1)}m, max ${heightStats.max.toFixed(
        1
      )}m, avg ${(heightStats.sum / buildings.length).toFixed(1)}m`
    );
  }

  const shadowsByBucket: Record<Bucket, Feature<Polygon>[]> = {
    morning: [],
    noon: [],
    afternoon: [],
    evening: [],
  };
  const indexByBucket: Record<Bucket, ShadowIndex | null> = {
    morning: null,
    noon: null,
    afternoon: null,
    evening: null,
  };
  for (const { name, hourIST } of BUCKETS) {
    shadowsByBucket[name] = buildShadowsForBucket(buildings, name, hourIST);
    indexByBucket[name] = buildShadowIndex(shadowsByBucket[name]);
    log(
      "5d",
      `${name}: spatial index built (${indexByBucket[name]!.cells.size} cells)`
    );
  }

  // 5d — score segments
  log("5d", `scoring ${graph.segments.length} segments × 4 buckets...`);
  const segmentRows: SegmentRow[] = [];
  const scoreStats: Record<Bucket, { sum: number; nz: number }> = {
    morning: { sum: 0, nz: 0 },
    noon: { sum: 0, nz: 0 },
    afternoon: { sum: 0, nz: 0 },
    evening: { sum: 0, nz: 0 },
  };
  for (const seg of graph.segments) {
    const na = graph.nodes.get(seg.a)!;
    const nb = graph.nodes.get(seg.b)!;
    const scores: Record<Bucket, number> = {
      morning: 0,
      noon: 0,
      afternoon: 0,
      evening: 0,
    };
    for (const { name } of BUCKETS) {
      const s = scoreSegment(
        na.lat,
        na.lng,
        nb.lat,
        nb.lng,
        seg.length_m,
        indexByBucket[name]
      );
      scores[name] = s;
      scoreStats[name].sum += s;
      if (s > 0) scoreStats[name].nz++;
    }
    segmentRows.push({
      from_node: seg.a,
      to_node: seg.b,
      length_m: Math.round(seg.length_m * 100) / 100,
      shade_morning: scores.morning,
      shade_noon: scores.noon,
      shade_afternoon: scores.afternoon,
      shade_evening: scores.evening,
      neighborhood: NEIGHBORHOOD,
    });
  }
  for (const { name } of BUCKETS) {
    const { sum, nz } = scoreStats[name];
    const avg = sum / Math.max(1, segmentRows.length);
    log(
      "5d",
      `${name}: avg shade ${avg.toFixed(3)}, ${nz}/${segmentRows.length} segments have nonzero shade`
    );
  }

  // 5e — write
  const nodeRows: NodeRow[] = [];
  graph.nodes.forEach(({ lat, lng }, id) => {
    nodeRows.push({
      id,
      lat: Math.round(lat * 1_000_000) / 1_000_000,
      lng: Math.round(lng * 1_000_000) / 1_000_000,
      neighborhood: NEIGHBORHOOD,
    });
  });
  log(
    "5e",
    `writing ${nodeRows.length} nodes and ${segmentRows.length} segments to Supabase...`
  );
  for (let i = 0; i < nodeRows.length; i += UPSERT_BATCH) {
    const slice = nodeRows.slice(i, i + UPSERT_BATCH);
    const { error } = await supabase
      .from("road_nodes")
      .upsert(slice, { onConflict: "id" });
    if (error) {
      throw new Error(
        `upsert road_nodes (rows ${i}..${i + slice.length}): ${error.message}`
      );
    }
    log("5e", `upserted road_nodes ${i + slice.length}/${nodeRows.length}`);
  }
  // road_segments has no natural unique key in the schema (id is UUID with
  // default), so plain insert. We clear the table first to keep reruns clean.
  log("5e", "clearing previous road_segments for neighborhood...");
  {
    const { error } = await supabase
      .from("road_segments")
      .delete()
      .eq("neighborhood", NEIGHBORHOOD);
    if (error) throw new Error(`delete road_segments: ${error.message}`);
  }
  const BATCH = UPSERT_BATCH;
  for (let i = 0; i < segmentRows.length; i += BATCH) {
    const slice = segmentRows.slice(i, i + BATCH);
    const { error } = await supabase.from("road_segments").insert(slice);
    if (error) {
      throw new Error(
        `insert road_segments (rows ${i}..${i + slice.length}): ${error.message}`
      );
    }
    log("5e", `inserted road_segments ${i + slice.length}/${segmentRows.length}`);
  }

  log(
    "DONE",
    `Wrote ${nodeRows.length} nodes, ${segmentRows.length} segments. Verify in Supabase: SELECT count(*) FROM road_segments;`
  );
}

main().catch((err) => {
  console.error("\n[FATAL]", err);
  process.exit(1);
});
