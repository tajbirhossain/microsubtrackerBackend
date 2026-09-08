import { z } from "zod";

const dateStringSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const currencySchema = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase());

export const createSubscriptionSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    amount: z.coerce.number().nonnegative(),
    currency: currencySchema.default("USD"),
    billingCycle: z.enum(["weekly", "monthly", "yearly"]),
    categoryId: z.string().uuid().optional(),
    categorySlug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    scale: z.enum(["micro", "macro"]).optional(),
    status: z.enum(["active", "cancelled", "paused"]).optional().default("active"),
    nextBillingDate: dateStringSchema.optional(),
    isTrial: z.boolean().optional().default(false),
    trialEndsAt: dateStringSchema.optional(),
    providerKey: z.string().trim().min(1).max(80).optional(),
    color: z.string().trim().min(1).max(32).optional(),
    icon: z.string().trim().min(1).max(16).optional(),
    cancellationNotes: z.string().trim().max(500).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.isTrial && !value.trialEndsAt) {
      ctx.addIssue({
        code: "custom",
        path: ["trialEndsAt"],
        message: "trialEndsAt is required when isTrial is true",
      });
    }
    if (!value.isTrial && value.trialEndsAt) {
      ctx.addIssue({
        code: "custom",
        path: ["trialEndsAt"],
        message: "trialEndsAt must be omitted when isTrial is false",
      });
    }
    if (value.status === "cancelled" && !value.cancellationNotes) {
      // notes optional on create-as-cancelled
    }
  });

export const updateSubscriptionSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    amount: z.coerce.number().nonnegative().optional(),
    currency: currencySchema.optional(),
    billingCycle: z.enum(["weekly", "monthly", "yearly"]).optional(),
    categoryId: z.string().uuid().nullable().optional(),
    categorySlug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .nullable()
      .optional(),
    scale: z.enum(["micro", "macro"]).optional(),
    status: z.enum(["active", "cancelled", "paused"]).optional(),
    nextBillingDate: dateStringSchema.nullable().optional(),
    isTrial: z.boolean().optional(),
    trialEndsAt: dateStringSchema.nullable().optional(),
    providerKey: z.string().trim().min(1).max(80).nullable().optional(),
    color: z.string().trim().min(1).max(32).nullable().optional(),
    icon: z.string().trim().min(1).max(16).nullable().optional(),
    cancellationNotes: z.string().trim().max(500).nullable().optional(),
    version: z.coerce.number().int().positive(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== "version"), {
    message: "At least one field besides version is required",
  });

export const listSubscriptionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  status: z.enum(["active", "cancelled", "paused"]).optional(),
  billingCycle: z.enum(["weekly", "monthly", "yearly"]).optional(),
  categorySlug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  search: z.string().trim().min(1).max(120).optional(),
});

export const upcomingQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
});

export const calendarQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

/** Matches frontend ghost threshold (`unusedDays >= 30`) and ghost-detection job. */
export const unusedQuerySchema = z.object({
  minDays: z.coerce.number().int().min(1).max(365).optional().default(30),
});

export const expiringTrialsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().default(14),
});

export const subscriptionIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const deleteSubscriptionSchema = z
  .object({
    version: z.coerce.number().int().positive(),
    cancellationNotes: z.string().trim().max(500).optional(),
  })
  .strict();

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
export type DeleteSubscriptionInput = z.infer<typeof deleteSubscriptionSchema>;
export type ListSubscriptionsQuery = z.infer<typeof listSubscriptionsQuerySchema>;
export type UpcomingQuery = z.infer<typeof upcomingQuerySchema>;
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;
export type UnusedQuery = z.infer<typeof unusedQuerySchema>;
export type ExpiringTrialsQuery = z.infer<typeof expiringTrialsQuerySchema>;
