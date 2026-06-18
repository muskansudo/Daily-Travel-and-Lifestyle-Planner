// DROP IN AT: src/lib/ai/card.ts (NEW FILE)
//
// Credit-card suggestion — Saanjh's "best card for this stop" layer.
//
// The financial sibling of outfit.ts's deterministic fallback. Pure function,
// no LLM, no network: given a venue category, pick the wallet card that earns
// the most for that kind of spend and write a grounded one-liner.
//
// Why deterministic: the SRS output is just "Suggested Credit Card for Spending"
// — a lookup, not a reasoning task. A rules table is faster, free, and can never
// hallucinate a card outside the wallet (same anti-hallucination guarantee
// plan.ts / outfit.ts give for venues and garments).
//
// Returns null for non-spend categories (park, walk, art) so the UI renders no
// card chip on those stops.

import type { VenueCategoryId } from "@/lib/constants/venues";
import {
  CATEGORY_SPEND_TYPE,
  SAMPLE_CARDS,
  type SampleCard,
  type SpendType,
} from "@/lib/constants/cards";

export interface CardSuggestion {
  cardId: string;
  cardName: string;
  rewardLabel: string; // "5% cashback on dining"
  reason: string; // grounded one-liner for this specific stop
  spendType: SpendType;
}

// Effective reward rate this card earns on a given spend type.
function effectiveRate(card: SampleCard, spend: SpendType): number {
  return card.bonus[spend] ?? card.baseRate;
}

/**
 * Pick the best card in the wallet for a venue category.
 *
 * @param category  venue category id (cafe, restaurant, bar, ...)
 * @param opts.wallet     defaults to SAMPLE_CARDS; pass the user's real cards
 *                        once a Supabase `cards` table exists.
 * @param opts.payerName  collab use — when set, frames the line as "put it on
 *                        {name}'s card" for the Friends / expense-split flow.
 */
export function suggestCardForCategory(
  category: VenueCategoryId | string,
  opts: { wallet?: SampleCard[]; payerName?: string } = {}
): CardSuggestion | null {
  const { wallet = SAMPLE_CARDS, payerName } = opts;

  const spend = CATEGORY_SPEND_TYPE[category as VenueCategoryId];
  if (!spend || wallet.length === 0) return null;

  // Highest effective rate wins; first card breaks ties (stable).
  const best = wallet.reduce((top, card) =>
    effectiveRate(card, spend) > effectiveRate(top, spend) ? card : top
  );

  const reason = payerName
    ? `Put this on ${payerName}'s ${best.name} — ${best.rewardLabel}, best in the group for ${spend}.`
    : `Pay with ${best.name} here — ${best.rewardLabel}, best in your wallet for ${spend}.`;

  return {
    cardId: best.id,
    cardName: best.name,
    rewardLabel: best.rewardLabel,
    reason,
    spendType: spend,
  };
}
