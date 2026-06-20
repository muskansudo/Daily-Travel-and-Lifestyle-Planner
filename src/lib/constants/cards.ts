// DROP IN AT: src/lib/constants/cards.ts
//
// Credit-card reward vocabulary — Saanjh's "best card for this stop" catalog.
//
// Mirrors src/lib/constants/venues.ts: a closed, code-owned catalog the picker
// scores against. No live financial API, no LLM. This is the "Financial
// products metadata" data input the SRS asks for.
//
// DESIGN NOTE (Block 3): rewardLabel uses DESCRIPTIVE, broadly-true language —
// NOT exact percentages. A hardcoded "10% cashback" goes stale the moment an
// issuer revises terms, and a wrong financial number is worse than a vague-but-
// true one. The `bonus` weights below are RELATIVE ranking signals only (which
// card wins for a category) — they are never shown to the user as numbers.
//
// PRODUCTION PATH: 30-40 cards sourced from issuer MITC (Most Important Terms &
// Conditions) disclosures. An AI pipeline parses each card's published MITC
// quarterly, flags changes from the stored version, and a human confirms before
// the catalog updates. Same ingestion architecture as venue tagging. Matching
// stays category-based (card -> spend type), mirroring how MCC-based rewards
// actually settle in India, so the pipeline scales with cards (dozens), not
// venues (thousands).

import type { VenueCategoryId } from "@/lib/constants/venues";

// The kinds of spend we reward. Venues map onto these; cards earn against them.
export type SpendType = "dining" | "entertainment" | "shopping";

// Which venue categories are "spend-worthy" and what they count as.
// Categories NOT listed here (park, walk, art) are free / low-spend -> no card.
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
  // Relative ranking weights — used ONLY to decide which card wins for a
  // category. Never displayed as a number to the user.
  baseRate: number;
  bonus: Partial<Record<SpendType, number>>;
  // Descriptive, broadly-true label shown in the UI. No exact percentages.
  rewardLabel: string;
}

// Six widely-held Indian cards covering dining, entertainment, and shopping.
// Names are public products. Descriptions are conservative and broadly true;
// they avoid exact rates that could be stale by demo day.
export const SAMPLE_CARDS: SampleCard[] = [
  {
    id: "hdfc_diners_black",
    name: "HDFC Diners Black",
    baseRate: 3,
    bonus: { dining: 9, entertainment: 8 },
    rewardLabel: "strong dining & entertainment rewards",
  },
  {
    id: "swiggy_hdfc",
    name: "Swiggy HDFC",
    baseRate: 1,
    bonus: { dining: 10 },
    rewardLabel: "one of the best dining cards in India",
  },
  {
    id: "axis_atlas",
    name: "Axis Atlas",
    baseRate: 2,
    bonus: { dining: 5, entertainment: 4 },
    rewardLabel: "travel miles on dining & going out",
  },
  {
    id: "amazon_pay_icici",
    name: "Amazon Pay ICICI",
    baseRate: 1,
    bonus: { shopping: 8 },
    rewardLabel: "strong everyday shopping rewards",
  },
  {
    id: "sbi_cashback",
    name: "SBI Cashback",
    baseRate: 1,
    bonus: { shopping: 7, dining: 6, entertainment: 6 },
    rewardLabel: "broad online cashback",
  },
  {
    id: "amex_platinum_travel",
    name: "Amex Platinum Travel",
    baseRate: 2,
    bonus: { dining: 6, entertainment: 5 },
    rewardLabel: "membership rewards on dining & experiences",
  },
];
