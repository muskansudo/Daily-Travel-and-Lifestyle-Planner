// DROP IN AT: src/lib/constants/cards.ts (NEW FILE)
//
// Credit-card reward vocabulary.
//
// Mirrors src/lib/constants/venues.ts + wardrobe.ts: a closed, code-owned
// vocabulary the picker scores against. No live financial API, no LLM. This is
// the "Financial products metadata (simulated)" data input the SRS asks for.
//
// REWARD RATES ARE ILLUSTRATIVE SEED VALUES. Real card rates change and vary by
// spend cap / merchant code. Treat them as configurable demo data, not advice.
// Upgrade path: replace SAMPLE_CARDS with a per-user Supabase `cards` table and
// pass the user's wallet into suggestCardForCategory() — the picker won't change.

import type { VenueCategoryId } from "@/lib/constants/venues";

// The kinds of spend we reward. Venues map onto these; cards earn against them.
export type SpendType = "dining" | "entertainment" | "shopping";

// Which venue categories are "spend-worthy" and what they count as.
// Categories NOT listed here (park, walk, art) are free / low-spend → no card.
export const CATEGORY_SPEND_TYPE: Partial<Record<VenueCategoryId, SpendType>> = {
  cafe: "dining",
  restaurant: "dining",
  bar: "dining",
  entertainment: "entertainment",
  bookstore: "shopping",
  wellness: "shopping",
};

export interface SampleCard {
  id: string;
  name: string;
  baseRate: number; // reward % on uncategorised spend
  bonus: Partial<Record<SpendType, number>>; // boosted rate per spend type
  rewardLabel: string; // human label shown in the UI
}

// A tiny representative wallet — enough to make "best card for THIS stop" feel
// real in the demo. Names are public products; rates are demo seed values.
export const SAMPLE_CARDS: SampleCard[] = [
  {
    id: "swiggy_hdfc",
    name: "Swiggy HDFC",
    baseRate: 1,
    bonus: { dining: 5 },
    rewardLabel: "5% cashback on dining",
  },
  {
    id: "axis_ace",
    name: "Axis ACE",
    baseRate: 1.5,
    bonus: { dining: 2, entertainment: 2 },
    rewardLabel: "2% on dining & entertainment",
  },
  {
    id: "hdfc_millennia",
    name: "HDFC Millennia",
    baseRate: 1,
    bonus: { shopping: 5, entertainment: 5 },
    rewardLabel: "5% cashback on shopping & entertainment",
  },
  {
    id: "sbi_cashback",
    name: "SBI Cashback",
    baseRate: 1,
    bonus: { shopping: 5, dining: 5, entertainment: 5 },
    rewardLabel: "5% cashback online",
  },
];
