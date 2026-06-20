// Saanjh: behavioral learning layer — user venue signals (Block 4)
//
// Read/write helpers for the user_venue_signals table. The fourth retrieval
// dimension: what the user actually DOES, persisted across sessions.
//
// SECURITY: all access goes through the service-role admin client (same as
// venue retrieval). The table has RLS enabled with no public policies, so no
// client key can touch it. User scoping is enforced here in code — every read
// and write is filtered by the authenticated user's internal id, which the
// caller resolves from Clerk via getOrCreateDbUser. We never accept a
// client-supplied user id.
//
// DEMO scope: only 'skipped' is written, and the read returns skipped venue
// ids for a hard exclude in retrieval. PRODUCTION extends this to more signal
// types and a weighted, time-decayed scoring modifier — the write path and
// table do not change; only the read evolves from filter to score.

import { createAdminClient } from "@/lib/supabase/admin";

export type VenueSignalType =
  | "skipped"
  | "accepted_repair"
  | "thumbs_up"
  | "thumbs_down"
  | "visited";

/**
 * Record a signal for (user, venue, type). Idempotent: the table has a unique
 * index on (user_id, venue_id, signal_type), so re-skipping the same venue is
 * a no-op via ON CONFLICT DO NOTHING.
 *
 * Failures are swallowed and logged — a signal write must never break the
 * user-facing action (skipping a venue still works even if the write fails).
 *
 * @param userId  internal users.id (NOT the Clerk id, NOT client-supplied)
 */
export async function recordVenueSignal(
  userId: string,
  venueId: string,
  signalType: VenueSignalType
): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase
      .from("user_venue_signals")
      .upsert(
        { user_id: userId, venue_id: venueId, signal_type: signalType },
        { onConflict: "user_id,venue_id,signal_type", ignoreDuplicates: true }
      );
  } catch (e) {
    // Non-fatal: log and move on. The learning layer is best-effort.
    console.error("[signals] recordVenueSignal failed:", e);
  }
}

/**
 * Return the set of venue ids this user has skipped. Used by retrieval to
 * exclude them from future generation (demo: hard exclude).
 *
 * Returns an empty array on any error so a signals failure never blocks plan
 * generation — the plan just isn't personalised by skips that one time.
 *
 * @param userId  internal users.id (NOT the Clerk id, NOT client-supplied)
 */
export async function getSkippedVenueIds(userId: string): Promise<string[]> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("user_venue_signals")
      .select("venue_id")
      .eq("user_id", userId)
      .eq("signal_type", "skipped");

    if (error || !data) return [];
    return data.map((row) => row.venue_id as string);
  } catch (e) {
    console.error("[signals] getSkippedVenueIds failed:", e);
    return [];
  }
}
