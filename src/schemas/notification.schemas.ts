import { z } from "zod";

const timeSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/, "Time must be HH:MM or HH:MM:SS");

export const updatePreferencesSchema = z
  .object({
    renewalsEnabled: z.boolean().optional(),
    trialsEnabled: z.boolean().optional(),
    unusedEnabled: z.boolean().optional(),
    weeklySummaryEnabled: z.boolean().optional(),
    upcomingWeekEnabled: z.boolean().optional(),
    quietHoursStart: timeSchema.nullable().optional(),
    quietHoursEnd: timeSchema.nullable().optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const startNull = value.quietHoursStart === null;
    const endNull = value.quietHoursEnd === null;
    const startSet = value.quietHoursStart !== undefined && value.quietHoursStart !== null;
    const endSet = value.quietHoursEnd !== undefined && value.quietHoursEnd !== null;

    if (startNull !== endNull) {
      ctx.addIssue({
        code: "custom",
        message: "quietHoursStart and quietHoursEnd must both be null to clear",
        path: ["quietHoursStart"],
      });
    }

    if (startSet !== endSet) {
      ctx.addIssue({
        code: "custom",
        message: "quietHoursStart and quietHoursEnd must be set together",
        path: ["quietHoursEnd"],
      });
    }

    const hasAny = Object.values(value).some((v) => v !== undefined);
    if (!hasAny) {
      ctx.addIssue({
        code: "custom",
        message: "At least one preference field is required",
      });
    }
  });

export const updatePushTokenSchema = z
  .object({
    deviceKey: z.string().trim().min(1).max(255),
    pushToken: z.string().trim().min(1).max(512).nullable(),
  })
  .strict();

export const listDeliveriesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
});

export const testNotificationSchema = z
  .object({
    type: z
      .enum(["trial", "renewal", "ghost", "weekly_summary", "upcoming_week"])
      .optional()
      .default("renewal"),
    title: z.string().trim().min(1).max(120).optional(),
    body: z.string().trim().min(1).max(280).optional(),
  })
  .strict();

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
export type UpdatePushTokenInput = z.infer<typeof updatePushTokenSchema>;
export type ListDeliveriesQuery = z.infer<typeof listDeliveriesQuerySchema>;
export type TestNotificationInput = z.infer<typeof testNotificationSchema>;
