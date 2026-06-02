-- Saanjh: migration 009 — entertainment category + seed venues
--
-- Adds the `entertainment` venue category and seeds 8 Bangalore entertainment
-- venues so the Friends collab planner has real "classic friend activity"
-- candidates. Previously, when two friends had zero shared interests the
-- retrieval pool was limited to cafes/restaurants/bars/art — now it can
-- surface movies, bowling, escape rooms, and gaming too.
--
-- Run after 008_friends.sql. Safe to re-run (ON CONFLICT DO NOTHING).
--
-- NOTE: price_tier is a NOT NULL column with no default, so every row must
-- supply it. 2 = mid-priced (₹₹), 3 = higher (₹₹₹).

-- ============================================================
-- 1.  Seed entertainment venues
--     All 8 are real Bangalore venues — lat/lng are best-effort from public
--     knowledge; verify and correct in the Supabase table editor after running.
-- ============================================================

INSERT INTO public.venues (
  name,
  category,
  neighborhood,
  lat,
  lng,
  vibe_tags,
  interest_tags,
  dietary_tags,
  opening_hours,
  time_of_day_fit,
  why_this_short,
  price_tier
) VALUES

-- 1. PVR Cinemas Phoenix Marketcity (Whitefield)
(
  'PVR Cinemas Phoenix Marketcity',
  'entertainment',
  'whitefield',
  12.9961,
  77.6969,
  ARRAY['social','lively'],
  ARRAY['night_out','music'],
  ARRAY['no_restrictions'],
  '10:00-23:00',
  ARRAY['afternoon','evening','night'],
  'Multiplex anchor of Phoenix Marketcity — wide slate, recliner screens, popcorn smell that hits the moment the escalator clears the food court.',
  2
),

-- 2. INOX Garuda Mall (MG Road / Brigade)
(
  'INOX Garuda Mall',
  'entertainment',
  'mg_road_brigade',
  12.9716,
  77.6077,
  ARRAY['social','lively'],
  ARRAY['night_out','music'],
  ARRAY['no_restrictions'],
  '10:00-22:30',
  ARRAY['afternoon','evening','night'],
  'Central Bangalore multiplex with an open-air food court attached — easy Friday plan for a pair landing from different sides of the city.',
  2
),

-- 3. Smaaash Phoenix Marketcity (Whitefield)
(
  'Smaaash Gaming Zone',
  'entertainment',
  'whitefield',
  12.9961,
  77.6969,
  ARRAY['social','lively','adventurous'],
  ARRAY['night_out'],
  ARRAY['no_restrictions'],
  '11:00-22:00',
  ARRAY['afternoon','evening','night'],
  'Bowling lanes, cricket simulators, and go-karts under one roof — the kind of place where a two-hour plan keeps extending itself.',
  3
),

-- 4. Mystery Rooms Indiranagar
(
  'Mystery Rooms Indiranagar',
  'entertainment',
  'indiranagar',
  12.9784,
  77.6408,
  ARRAY['adventurous','social'],
  ARRAY['night_out'],
  ARRAY['no_restrictions'],
  '10:00-22:00',
  ARRAY['afternoon','evening','night'],
  'Escape-room venue with multiple themed rooms — an hour of collaborative puzzle-solving that doubles as a genuine icebreaker for new friend pairs.',
  2
),

-- 5. The Comedy Theatre (MG Road / Brigade area)
(
  'The Comedy Theatre',
  'entertainment',
  'mg_road_brigade',
  12.9636,
  77.6055,
  ARRAY['social','lively'],
  ARRAY['night_out','music'],
  ARRAY['no_restrictions'],
  '18:00-23:00',
  ARRAY['evening','night'],
  'Live stand-up comedy nights in an intimate 150-seat space — the shared laughter makes it one of the easiest first-time outings for a new friend pair.',
  2
),

-- 6. Skyzone Trampoline Park (Bagmane / ORR)
(
  'Skyzone Trampoline Park',
  'entertainment',
  'bagmane_orr',
  12.9589,
  77.7118,
  ARRAY['adventurous','social','lively'],
  ARRAY['workout','night_out'],
  ARRAY['no_restrictions'],
  '10:00-21:00',
  ARRAY['afternoon','evening'],
  'Trampoline arena with foam pits and dodgeball courts — the ORR crowd''s go-to for an afternoon that doesn''t feel like exercise until the next morning.',
  3
),

-- 7. Cinepolis Forum Koramangala
(
  'Cinepolis Forum Koramangala',
  'entertainment',
  'koramangala',
  12.9352,
  77.6245,
  ARRAY['social','lively'],
  ARRAY['night_out','music'],
  ARRAY['no_restrictions'],
  '09:30-23:00',
  ARRAY['afternoon','evening','night'],
  'Top-floor multiplex in Forum Mall — gold-class recliners are worth booking ahead; the mall below handles dinner before or after.',
  2
),

-- 8. Toit Brewery Games Floor (Koramangala)
(
  'Toit Brewery Games Floor',
  'entertainment',
  'koramangala',
  12.9387,
  77.6224,
  ARRAY['social','lively'],
  ARRAY['night_out'],
  ARRAY['no_restrictions'],
  '12:00-23:30',
  ARRAY['afternoon','evening','night'],
  'Board games, foosball, and craft beer under the same roof — Toit''s games floor is the most natural "what do two friends with nothing in common do?" answer in south Bangalore.',
  3
)

ON CONFLICT DO NOTHING;

-- ============================================================
-- 2.  Sanity check (for human eyeballs after running)
-- ============================================================
--   SELECT category, COUNT(*) FROM public.venues GROUP BY category ORDER BY category;
-- Expected: entertainment now appears with 8 rows.
--
--   SELECT name, time_of_day_fit, price_tier FROM public.venues WHERE category = 'entertainment';
-- All 8 rows should have at least ['afternoon','evening','night'] and a price_tier.
-- Comedy Theatre and Skyzone have narrower time fits — that's intentional.
