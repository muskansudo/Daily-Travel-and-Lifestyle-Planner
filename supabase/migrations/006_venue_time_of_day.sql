-- Saanjh: add time_of_day_fit column to venues — idempotent / safe to re-run
--
-- Curation upgrade (design doc v2, section 5).
-- Per-slot retrieval uses this column as a HARD FILTER: a 20:00 dinner slot
-- never sees a venue tagged morning-only. The LLM never gets to pick wrong.
--
-- Closed vocabulary: morning | midday | afternoon | evening | night
-- Boundaries (IST):
--   morning   06:00 - 11:00
--   midday    11:00 - 15:00  (lunch zone)
--   afternoon 15:00 - 18:00
--   evening   18:00 - 21:00  (dinner zone)
--   night     21:00 - 23:00
--
-- Backfill uses category defaults (design doc section 5). Override per-venue
-- after this migration runs if any individual venue needs different fit.

-- ============================================================
-- 1. Add the column (idempotent)
-- ============================================================
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS time_of_day_fit TEXT[] NOT NULL DEFAULT '{}';

-- ============================================================
-- 2. GIN index for fast overlap filtering (idempotent)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_venues_time_of_day_gin
  ON public.venues USING GIN (time_of_day_fit);

-- ============================================================
-- 3. Backfill from category defaults
-- ============================================================
-- Only touches rows where time_of_day_fit is empty, so re-running this
-- migration won't clobber manual per-venue overrides made later.

UPDATE public.venues
SET time_of_day_fit = CASE category
  WHEN 'cafe'      THEN ARRAY['morning','midday','afternoon']
  WHEN 'restaurant'THEN ARRAY['midday','evening']
  WHEN 'bar'       THEN ARRAY['evening','night']
  WHEN 'park'      THEN ARRAY['morning','afternoon']
  WHEN 'walk'      THEN ARRAY['morning','afternoon','evening']
  WHEN 'art'       THEN ARRAY['afternoon','evening']
  WHEN 'bookstore' THEN ARRAY['afternoon','evening']
  WHEN 'wellness'  THEN ARRAY['morning','afternoon']
  ELSE ARRAY['morning','midday','afternoon','evening']  -- safe default for unknown categories
END
WHERE time_of_day_fit = '{}' OR time_of_day_fit IS NULL;

-- ============================================================
-- 4. Sanity check (for human eyeballs after running)
-- ============================================================
-- After running, eyeball these to confirm backfill landed sensibly:
--
--   SELECT category, time_of_day_fit, COUNT(*)
--   FROM public.venues
--   GROUP BY category, time_of_day_fit
--   ORDER BY category;
--
-- Expected: every row has at least one bucket; cafes get 3 buckets;
-- restaurants get 2 (midday + evening); bars get 2 (evening + night).
