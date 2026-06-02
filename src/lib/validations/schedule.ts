import { z } from "zod";

const hhmm = z
  .string()
  .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "Use HH:MM format");

export const manualScheduleEntrySchema = z.object({
  id: z.string().uuid(),
  startTime: hhmm,
  endTime: hhmm,
  activity: z.string().trim().min(1).max(120),
  explanation: z.string().trim().max(200).optional(),
});

export const manualScheduleSchema = z.object({
  entries: z.array(manualScheduleEntrySchema).max(24),
});

export type ManualScheduleInput = z.infer<typeof manualScheduleSchema>;
