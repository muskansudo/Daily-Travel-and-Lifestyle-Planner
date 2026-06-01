import type {
  CollabPlanGenerateResponse,
  SharedPlanPayloadV1,
} from "@/lib/types/friends";

/** Client-safe: build save payload from generate API response (no server imports). */
export function generateResponseToPayload(
  response: CollabPlanGenerateResponse
): Omit<SharedPlanPayloadV1, "createdByUserId"> {
  const aiGenerated = response.windows.some((w) => w.plan.aiGenerated);

  return {
    version: 1,
    windows: response.windows.map((w) => ({
      freeWindow: {
        startIso: w.freeWindow.start,
        endIso: w.freeWindow.end,
        rangeLabel: w.rangeLabel,
        durationMinutes: w.durationMinutes,
        status: w.status,
      },
      plan: w.plan,
      candidatesCount: w.candidatesCount,
      skippedReason: w.skippedReason,
    })),
    events: response.events,
    meta: {
      energyAlignmentPercent: response.compatibility.energyAlignmentPercent,
      sharedInterestLabels: response.compatibility.sharedInterestLabels,
      sharedLifestyleLabels: response.compatibility.sharedLifestyleLabels,
      sharedDietaryLabels: response.compatibility.sharedDietaryLabels,
      aiGenerated,
    },
    generatedAt: new Date().toISOString(),
  };
}
