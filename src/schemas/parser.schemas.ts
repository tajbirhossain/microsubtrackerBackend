import { z } from "zod";

export const ingestParserSchema = z
  .object({
    sourceType: z.enum(["sms", "notification"]),
    rawPayload: z.string().trim().min(1).max(5000),
    sender: z.string().trim().min(1).max(120).optional(),
    packageName: z.string().trim().min(1).max(180).optional(),
    receivedAt: z.string().datetime().optional(),
    deviceKey: z.string().trim().min(1).max(255).optional(),
  })
  .strict();

export const listParserQuerySchema = z.object({
  status: z
    .enum(["pending", "classified", "confirmed", "rejected", "failed"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const parserEventIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const confirmParserSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    amount: z.coerce.number().positive().optional(),
    currency: z
      .string()
      .trim()
      .length(3)
      .transform((v) => v.toUpperCase())
      .optional(),
    billingCycle: z.enum(["weekly", "monthly", "yearly"]).optional(),
    categorySlug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    nextBillingDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .strict();

export type IngestParserInput = z.infer<typeof ingestParserSchema>;
export type ConfirmParserInput = z.infer<typeof confirmParserSchema>;
export type ListParserQuery = z.infer<typeof listParserQuerySchema>;
