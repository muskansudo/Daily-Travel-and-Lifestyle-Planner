import { z } from "zod";

const uuidSchema = z.string().uuid();

export const addFriendSchema = z.object({
  friendUserId: uuidSchema,
});

export const friendSearchSchema = z.object({
  q: z.string().trim().min(1).max(80),
});

export const createExpenseSchema = z.object({
  description: z.string().trim().min(1).max(200),
  place: z.string().trim().max(200).optional(),
  amountInr: z.number().positive().max(10_000_000),
  paidBy: z.enum(["me", "friend"]),
});

const sharedWindowStatusSchema = z.enum(["past", "current", "upcoming"]);

const collabPlanBodySchema = z.object({
  stops: z.array(
    z.object({
      venueId: z.string().min(1),
      venueName: z.string(),
      category: z.string(),
      neighborhood: z.string(),
      startTime: z.string(),
      endTime: z.string(),
      whyThis: z.string(),
    })
  ),
  summary: z.string(),
  aiGenerated: z.boolean(),
});

const collabSerializedEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  start: z.string(),
  end: z.string(),
  location: z.string().nullable(),
  allDay: z.boolean(),
});

const sharedPlanWindowPayloadSchema = z.object({
  freeWindow: z.object({
    startIso: z.string(),
    endIso: z.string(),
    rangeLabel: z.string(),
    durationMinutes: z.coerce.number().int().nonnegative(),
    status: sharedWindowStatusSchema,
  }),
  plan: collabPlanBodySchema,
  candidatesCount: z.number().int().nonnegative(),
  skippedReason: z.enum(["past", "cap"]).optional(),
});

export const saveSharedPlanSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  payload: z.object({
    version: z.literal(1),
    windows: z.array(sharedPlanWindowPayloadSchema).min(1),
    events: z.array(collabSerializedEventSchema),
    meta: z.object({
      energyAlignmentPercent: z.number().int().min(0).max(100),
      sharedInterestLabels: z.array(z.string()),
      sharedLifestyleLabels: z.array(z.string()),
      sharedDietaryLabels: z.array(z.string()),
      aiGenerated: z.boolean(),
    }),
    generatedAt: z.string(),
  }),
});

export type AddFriendInput = z.infer<typeof addFriendSchema>;
export type FriendSearchInput = z.infer<typeof friendSearchSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type SaveSharedPlanInput = z.infer<typeof saveSharedPlanSchema>;
