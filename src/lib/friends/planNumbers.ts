import type { SharedPlanDTO } from "@/lib/types/friends";

/** Plan #1 = earliest created; numbering follows formation order. */
export function planNumbersByCreationOrder(
  plans: Pick<SharedPlanDTO, "id" | "createdAt">[]
): Map<string, number> {
  const chronological = [...plans].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const map = new Map<string, number>();
  chronological.forEach((plan, index) => {
    map.set(plan.id, index + 1);
  });
  return map;
}
