// src/app/api/route/shaded/route.ts
//
// POST /api/route/shaded — runtime shade-aware routing.
//
// Reads the precomputed road graph (road_nodes + road_segments, populated by
// scripts/build-shade-graph.ts) from Supabase, builds an in-memory ngraph, and
// runs A* twice:
//   - fastest: weight = segment length (meters)
//   - shaded:  weight = length × (1 + 3 × (1 − shade)) for the requested
//              time-of-day bucket
//
// Returns both routes as GeoJSON LineStrings plus distance, walk minutes,
// and average shade score. No geometry libraries imported here — all that
// belongs in the offline script. Only ngraph (graph + A*) and haversine.

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import createGraph from "ngraph.graph";
import type { Graph, Link } from "ngraph.graph";
import { aStar } from "ngraph.path";
import { DEFAULT_BIAS_LATLNG } from "@/lib/constants/venues";

const NEIGHBORHOOD = "bagmane_orr";
const SHADE_PENALTY = 3; // tuned in spec §1 — high enough to prefer cover, low
//                          enough that the shaded route stays sane
const WALK_KMH = 5; // pedestrian assumption

// Bbox of the precomputed shade graph (matches scripts/build-shade-graph.ts
// and the Earth Engine export). Shade data only exists inside this rectangle.
// A destination outside it must NOT be silently snapped to the graph's edge —
// that would draw a real-looking shaded route to the wrong place. Instead we
// return graph_unavailable so the client falls back to a plain map.
const SHADE_GRAPH_BBOX = {
  south: 12.9699,
  west: 77.6574,
  north: 13.0018,
  east: 77.6966,
} as const;

function isInsideShadeGraph(lat: number, lng: number): boolean {
  return (
    lat >= SHADE_GRAPH_BBOX.south &&
    lat <= SHADE_GRAPH_BBOX.north &&
    lng >= SHADE_GRAPH_BBOX.west &&
    lng <= SHADE_GRAPH_BBOX.east
  );
}

type Bucket = "morning" | "noon" | "afternoon" | "evening";

interface NodeRow {
  id: number;
  lat: number;
  lng: number;
}
interface SegmentRow {
  from_node: number;
  to_node: number;
  length_m: number;
  shade_morning: number;
  shade_noon: number;
  shade_afternoon: number;
  shade_evening: number;
}

interface LinkData {
  length: number;
  shade_morning: number;
  shade_noon: number;
  shade_afternoon: number;
  shade_evening: number;
}

interface NodeData {
  lat: number;
  lng: number;
}

// ─── Module-level cache ──────────────────────────────────────────────────────
// Cache the graph per neighborhood so repeated requests don't re-fetch from
// Supabase. Same singleton pattern used elsewhere in the codebase.
//
// We also precompute the LARGEST CONNECTED COMPONENT of the road graph at
// load time. OSM road networks are notoriously fragmented in places — small
// disconnected stubs (driveways, footpaths) appear as separate components.
// If origin snaps to one component and destination to another, A* returns
// no path. Snapping both to the largest component avoids this entirely:
// the largest component reliably covers all real venues and trip origins
// inside the bbox.
interface CachedGraph {
  graph: Graph<NodeData, LinkData>;
  nodes: NodeRow[]; // all nodes (for diagnostics)
  largestComponentNodes: NodeRow[]; // subset reachable from each other
  largestComponentSize: number;
}
const graphCache = new Map<string, CachedGraph>();

function computeLargestComponent(
  graph: Graph<NodeData, LinkData>,
  nodes: NodeRow[]
): Set<number> {
  // BFS over the undirected graph. ngraph.forEachLinkedNode visits neighbors;
  // we use it to walk reachable nodes from each unvisited start.
  const visited = new Set<number>();
  let bestComponent: Set<number> = new Set();

  for (const startNode of nodes) {
    if (visited.has(startNode.id)) continue;
    const component = new Set<number>();
    const queue: number[] = [startNode.id];
    component.add(startNode.id);
    visited.add(startNode.id);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      graph.forEachLinkedNode(
        cur,
        (other) => {
          const oid = other.id as number;
          if (!component.has(oid)) {
            component.add(oid);
            visited.add(oid);
            queue.push(oid);
          }
        },
        false /* oriented: treat as undirected */
      );
    }
    if (component.size > bestComponent.size) {
      bestComponent = component;
    }
  }
  return bestComponent;
}

async function loadGraph(neighborhood: string): Promise<CachedGraph | null> {
  const cached = graphCache.get(neighborhood);
  if (cached) return cached;

  const supabase = createAdminClient();

  // Supabase caps a plain `.select()` at 1000 rows by default. With 12k+
  // nodes and 13k+ segments we'd silently get a sliced graph, which then
  // fragments into many disconnected components (we saw 18% in the largest
  // one). Paginate explicitly with .range() until we've read everything.
  const PAGE_SIZE = 1000;

  async function fetchAll<T>(
    table: string,
    columns: string
  ): Promise<T[]> {
    const out: T[] = [];
    let from = 0;
    while (true) {
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from(table)
        .select(columns)
        .eq("neighborhood", neighborhood)
        .range(from, to);
      if (error) throw new Error(`load ${table}: ${error.message}`);
      if (!data || data.length === 0) break;
      out.push(...(data as T[]));
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    return out;
  }

  const nodes = await fetchAll<NodeRow>("road_nodes", "id, lat, lng");
  const segments = await fetchAll<SegmentRow>(
    "road_segments",
    "from_node, to_node, length_m, shade_morning, shade_noon, shade_afternoon, shade_evening"
  );

  if (nodes.length === 0 || segments.length === 0) {
    return null;
  }

  // Build ngraph
  const graph = createGraph<NodeData, LinkData>();
  for (const n of nodes) {
    graph.addNode(n.id, { lat: Number(n.lat), lng: Number(n.lng) });
  }
  for (const s of segments) {
    graph.addLink(s.from_node, s.to_node, {
      length: Number(s.length_m),
      shade_morning: Number(s.shade_morning),
      shade_noon: Number(s.shade_noon),
      shade_afternoon: Number(s.shade_afternoon),
      shade_evening: Number(s.shade_evening),
    });
  }

  const nodeRows: NodeRow[] = nodes.map((n) => ({
    id: n.id as number,
    lat: Number(n.lat),
    lng: Number(n.lng),
  }));

  // Compute the largest connected component once at load time.
  const componentIds = computeLargestComponent(graph, nodeRows);
  const largestComponentNodes = nodeRows.filter((n) => componentIds.has(n.id));
  // Helpful one-time log to confirm coverage. Visible in `npm run dev` output.
  console.log(
    `[route/shaded] graph loaded: ${nodeRows.length} nodes total, ${largestComponentNodes.length} in largest component (${(
      (100 * largestComponentNodes.length) /
      nodeRows.length
    ).toFixed(1)}%)`
  );

  const entry: CachedGraph = {
    graph,
    nodes: nodeRows,
    largestComponentNodes,
    largestComponentSize: largestComponentNodes.length,
  };
  graphCache.set(neighborhood, entry);
  return entry;
}

// ─── Haversine ───────────────────────────────────────────────────────────────
// In meters. Used for both A*'s admissible heuristic and nearest-node snap.
function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function snapToNearestNode(
  lat: number,
  lng: number,
  nodes: NodeRow[]
): NodeRow | null {
  let best: NodeRow | null = null;
  let bestD = Infinity;
  for (const n of nodes) {
    const d = haversine(lat, lng, n.lat, n.lng);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

// ─── Build GeoJSON LineString + stats from an ngraph path ───────────────────
// ngraph.path returns the path as an array of NODES, ordered from destination
// to source by default. We reverse to source→destination.
function summarizePath(
  path: Array<{ id: string | number; data: NodeData }>,
  graph: Graph<NodeData, LinkData>,
  bucket: Bucket
): {
  geojson: {
    type: "Feature";
    geometry: { type: "LineString"; coordinates: [number, number][] };
    properties: Record<string, unknown>;
  };
  distanceM: number;
  walkMinutes: number;
  avgShade: number;
} {
  // Reverse to forward order
  const fwd = [...path].reverse();
  const coords: [number, number][] = fwd.map((n) => [n.data.lng, n.data.lat]);

  let totalLen = 0;
  let weightedShade = 0; // ∑ length × shade
  const shadeKey: keyof LinkData =
    bucket === "morning"
      ? "shade_morning"
      : bucket === "noon"
      ? "shade_noon"
      : bucket === "afternoon"
      ? "shade_afternoon"
      : "shade_evening";

  for (let i = 0; i < fwd.length - 1; i++) {
    const a = fwd[i].id;
    const b = fwd[i + 1].id;
    // ngraph stores undirected edges in a way that getLink(a,b) may return
    // null if it was added in (b,a) order. Check both directions.
    const link =
      graph.getLink(a, b) ?? graph.getLink(b, a) ?? null;
    if (!link || !link.data) continue;
    totalLen += link.data.length;
    weightedShade += link.data.length * (link.data[shadeKey] as number);
  }

  const avgShade = totalLen > 0 ? weightedShade / totalLen : 0;
  const walkMinutes = Math.round(totalLen / ((WALK_KMH * 1000) / 60));

  return {
    geojson: {
      type: "Feature",
      geometry: { type: "LineString", coordinates: coords },
      properties: {},
    },
    distanceM: Math.round(totalLen * 100) / 100,
    walkMinutes,
    avgShade: Math.round(avgShade * 1000) / 1000,
  };
}

// ─── Request handling ────────────────────────────────────────────────────────
interface ShadedRouteRequest {
  origin?: { lat: number; lng: number };
  destination?: { lat: number; lng: number };
  // Preferred: resolve the destination's real coordinates from the venues
  // table by id. The home-page plan currently stamps DEFAULT_BIAS_LATLNG on
  // every venue card's `location`, so the client can't be trusted to send a
  // useful destination — but it always has the venue id.
  venueId?: string;
  timeOfDay: Bucket;
}

function isBucket(s: unknown): s is Bucket {
  return s === "morning" || s === "noon" || s === "afternoon" || s === "evening";
}

// Resolve real venue coordinates from the venues table. Returns null if the
// id isn't found or has no usable coords.
async function venueCoords(
  venueId: string
): Promise<{ lat: number; lng: number } | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("venues")
    .select("lat, lng")
    .eq("id", venueId)
    .maybeSingle();
  if (error || !data) return null;
  const lat = Number(data.lat);
  const lng = Number(data.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export async function POST(request: Request) {
  const clerkId = await requireAuth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ShadedRouteRequest;
  try {
    body = (await request.json()) as ShadedRouteRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isBucket(body.timeOfDay)) {
    return NextResponse.json(
      { error: "Missing or invalid timeOfDay" },
      { status: 400 }
    );
  }

  // Resolve the destination. Prefer the venue lookup by id (real coords);
  // fall back to the destination the client sent.
  let destination: { lat: number; lng: number } | null = null;
  if (body.venueId) {
    destination = await venueCoords(body.venueId);
  }
  if (
    !destination &&
    body.destination &&
    typeof body.destination.lat === "number" &&
    typeof body.destination.lng === "number"
  ) {
    destination = body.destination;
  }
  if (!destination) {
    return NextResponse.json(
      { error: "Missing destination: provide venueId or destination {lat,lng}" },
      { status: 400 }
    );
  }

  // Gate: only serve a shaded route if the destination actually falls inside
  // the precomputed shade graph. Otherwise snapToNearestNode would clamp a
  // faraway venue (e.g. Whitefield, Koramangala) to the boundary of the
  // Bagmane/ORR graph and draw a real-looking route to the WRONG place. We
  // return graph_unavailable so the UI shows a plain map fallback — the honest
  // "we only have shade data where we computed it" behavior.
  if (!isInsideShadeGraph(destination.lat, destination.lng)) {
    return NextResponse.json({ error: "graph_unavailable" }, { status: 200 });
  }

  const origin = body.origin ?? DEFAULT_BIAS_LATLNG;

  let cached: CachedGraph | null;
  try {
    cached = await loadGraph(NEIGHBORHOOD);
  } catch (err) {
    console.error("[/api/route/shaded] graph load failed", err);
    return NextResponse.json({ error: "graph_unavailable" }, { status: 200 });
  }
  if (!cached) {
    return NextResponse.json({ error: "graph_unavailable" }, { status: 200 });
  }

  const { graph, largestComponentNodes } = cached;
  // Snap origin and destination to nodes within the LARGEST connected
  // component of the road graph. OSM road networks are fragmented — small
  // unreachable stubs (driveways, dead-end footpaths) form separate
  // components. Restricting to the largest component guarantees A* can
  // always find a path between any two snapped nodes.
  const startNode = snapToNearestNode(origin.lat, origin.lng, largestComponentNodes);
  const endNode = snapToNearestNode(
    destination.lat,
    destination.lng,
    largestComponentNodes
  );
  if (!startNode || !endNode) {
    return NextResponse.json({ error: "no_route" }, { status: 200 });
  }
  if (startNode.id === endNode.id) {
    return NextResponse.json({ error: "no_route" }, { status: 200 });
  }

  const bucket = body.timeOfDay;
  const shadeKey: keyof LinkData =
    bucket === "morning"
      ? "shade_morning"
      : bucket === "noon"
      ? "shade_noon"
      : bucket === "afternoon"
      ? "shade_afternoon"
      : "shade_evening";

  // Admissible A* heuristic: straight-line haversine to destination, in
  // meters. Stays admissible for the shaded weighting because every shaded
  // edge weight ≥ its physical length.
  const destLat = endNode.lat;
  const destLng = endNode.lng;
  const heuristic = (
    from: { data: NodeData },
    _to: { data: NodeData }
  ): number => haversine(from.data.lat, from.data.lng, destLat, destLng);

  // Run A* twice. ngraph.path with `oriented: false` treats links as
  // undirected so we don't need to add reverse links manually.
  const pathfinderFastest = aStar(graph, {
    distance: (_a, _b, link: Link<LinkData>) => link.data.length,
    heuristic,
    oriented: false,
  });
  const pathfinderShaded = aStar(graph, {
    distance: (_a, _b, link: Link<LinkData>) => {
      const shade = link.data[shadeKey] as number;
      return link.data.length * (1 + SHADE_PENALTY * (1 - shade));
    },
    heuristic,
    oriented: false,
  });

  const fastestPath = pathfinderFastest.find(startNode.id, endNode.id);
  const shadedPath = pathfinderShaded.find(startNode.id, endNode.id);

  if (!fastestPath || fastestPath.length === 0 || !shadedPath || shadedPath.length === 0) {
    return NextResponse.json({ error: "no_route" }, { status: 200 });
  }

  // ngraph nodes carry .data; coerce shape for summarizePath
  const fastestNodes = fastestPath.map((n) => ({
    id: n.id,
    data: n.data as NodeData,
  }));
  const shadedNodes = shadedPath.map((n) => ({
    id: n.id,
    data: n.data as NodeData,
  }));

  const fastest = summarizePath(fastestNodes, graph, bucket);
  const shaded = summarizePath(shadedNodes, graph, bucket);

  return NextResponse.json({
    fastest,
    shaded,
    snap: {
      origin: { lat: startNode.lat, lng: startNode.lng, id: startNode.id },
      destination: { lat: endNode.lat, lng: endNode.lng, id: endNode.id },
    },
    timeOfDay: bucket,
  });
}
