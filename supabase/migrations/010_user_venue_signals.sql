-- Saanjh: behavioral learning layer — user venue signals (Block 4)
-- Idempotent / safe to re-run.
--
-- The fourth retrieval dimension. Interest, vibe, and distance are static or
-- daily; this table captures what the user actually DOES over time. For the
-- prototype we write only 'skipped' and hard-exclude skipped venues from
-- future generation. The other signal types are in the CHECK constraint
-- already so production can write them without a schema migration — the table
-- is forward-compatible by design.
--
-- Production path: read becomes a scoring DOWN-weight (not a hard exclude),
-- signals time-decay, and accepted_repair / thumbs_up / thumbs_down / visited
-- all feed an L2 scoring modifier. Table and write path do not change; only the
-- read path evolves from filter to weighted score.
--
-- ───────────────────────────────────────────────────────────────────────────
-- SECURITY MODEL (defense in depth) — matches every other user-data table in
-- this project (users, wardrobe_items, friendships, shared_plans):
--
--   1. Auth is Clerk, not Supabase Auth. Users are identified by clerk_id and
--      mapped to an internal users.id (UUID). Supabase Auth issues no JWT here,
--      so auth.uid() does NOT apply — RLS policies referencing it would never
--      match. We deliberately do NOT use auth.uid().
--
--   2. RLS is ENABLED with NO public policies. This denies ALL access to the
--      anon and authenticated (client-exposed) keys by default. No browser key
--      can ever read or write this table — not its own rows, not anyone's.
--
--   3. The service-role key is the ONLY path that reaches this table. It
--      bypasses RLS by design, is stored server-side only (never sent to the
--      client), and is used exclusively in server API routes the user cannot
--      reach directly.
--
--   4. User scoping is enforced in application code: every read and write
--      filters by the authenticated Clerk user's internal id. RLS is the
--      second, independent layer — if app code ever had a bug or a client key
--      were misused, the database itself still refuses all client access.
--
--   5. ON DELETE CASCADE on both foreign keys: when a user or venue is removed,
--      their signals are cleaned up automatically — no orphaned user data left
--      behind (data-minimisation / right-to-erasure friendly).
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_venue_signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL CHECK (
    signal_type IN (
      'skipped',          -- user tapped "Not this one"
      'accepted_repair',  -- user accepted the agent's replacement (future)
      'thumbs_up',        -- positive rating after visiting (future)
      'thumbs_down',      -- negative rating after visiting (future)
      'visited'           -- user confirmed they went (future)
    )
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup of a user's signals by type (the retrieval read path filters on
-- user_id + signal_type = 'skipped').
CREATE INDEX IF NOT EXISTS idx_user_venue_signals_user_type
  ON public.user_venue_signals (user_id, signal_type);

-- Recency index for the production time-decay read path.
CREATE INDEX IF NOT EXISTS idx_user_venue_signals_user_created
  ON public.user_venue_signals (user_id, created_at DESC);

-- One row per (user, venue, signal_type). Re-skipping the same venue is a
-- no-op rather than a duplicate row. The write path uses ON CONFLICT DO NOTHING.
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_venue_signal
  ON public.user_venue_signals (user_id, venue_id, signal_type);

-- Enable RLS with NO public policies → deny all client (anon/authenticated)
-- access. Service-role (server-only) bypasses RLS and is the sole accessor.
-- This matches friendships / shared_plans / friend_expenses in 008_friends.sql.
ALTER TABLE public.user_venue_signals ENABLE ROW LEVEL SECURITY;
