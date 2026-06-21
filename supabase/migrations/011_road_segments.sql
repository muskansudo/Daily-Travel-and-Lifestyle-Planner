-- Saanjh: shade-aware routing — road graph (nodes + shade-scored segments)
-- Idempotent / safe to re-run. Precomputed offline, read-only at runtime.
--
-- The pipeline:
--   1. scripts/build-shade-graph.ts (offline, one-time) pulls OSM buildings +
--      roads for the Bagmane/ORR bbox, projects building shadows with suncalc
--      at 4 times of day, scores each road segment by % length in shadow, and
--      writes the result here.
--   2. /api/route/shaded (runtime) loads these rows, builds an ngraph in
--      memory, and runs A* twice (fastest vs shaded weight) per request.
--
-- Read-only reference data, like venues. Public read; service-role writes
-- only. RLS policy mirrors 004_venues.sql.

CREATE TABLE IF NOT EXISTS public.road_nodes (
  id BIGINT PRIMARY KEY,            -- OSM node id (stable, reused as graph id)
  lat NUMERIC(9,6) NOT NULL,
  lng NUMERIC(9,6) NOT NULL,
  neighborhood TEXT NOT NULL DEFAULT 'bagmane_orr'
);

CREATE TABLE IF NOT EXISTS public.road_segments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_node BIGINT NOT NULL REFERENCES public.road_nodes(id) ON DELETE CASCADE,
  to_node   BIGINT NOT NULL REFERENCES public.road_nodes(id) ON DELETE CASCADE,
  length_m  NUMERIC(8,2) NOT NULL,
  -- shade score in [0,1] per time-of-day bucket: 0 = full sun, 1 = full shade
  shade_morning   NUMERIC(4,3) NOT NULL DEFAULT 0,
  shade_noon      NUMERIC(4,3) NOT NULL DEFAULT 0,
  shade_afternoon NUMERIC(4,3) NOT NULL DEFAULT 0,
  shade_evening   NUMERIC(4,3) NOT NULL DEFAULT 0,
  neighborhood TEXT NOT NULL DEFAULT 'bagmane_orr'
);

CREATE INDEX IF NOT EXISTS idx_road_segments_hood
  ON public.road_segments (neighborhood);
CREATE INDEX IF NOT EXISTS idx_road_nodes_hood
  ON public.road_nodes (neighborhood);

ALTER TABLE public.road_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.road_segments ENABLE ROW LEVEL SECURITY;

-- Read-only reference data (like venues): authenticated read, service-role
-- writes only. Mirrors the venues table policy in 004_venues.sql.
DROP POLICY IF EXISTS "Road nodes readable" ON public.road_nodes;
CREATE POLICY "Road nodes readable" ON public.road_nodes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Road segments readable" ON public.road_segments;
CREATE POLICY "Road segments readable" ON public.road_segments FOR SELECT USING (true);
