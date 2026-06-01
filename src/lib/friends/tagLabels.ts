import {
  DIETARY_OPTIONS,
  INTEREST_OPTIONS,
  LIFESTYLE_OPTIONS,
} from "@/lib/constants/preferences";

const LABEL_BY_ID = new Map<string, string>(
  [...DIETARY_OPTIONS, ...LIFESTYLE_OPTIONS, ...INTEREST_OPTIONS].map(
    (o) => [o.id, o.label]
  )
);

export function tagIdToLabel(id: string): string {
  return LABEL_BY_ID.get(id) ?? id.replace(/_/g, " ");
}

export function tagIdsToLabels(ids: string[]): string[] {
  return ids.map(tagIdToLabel);
}
