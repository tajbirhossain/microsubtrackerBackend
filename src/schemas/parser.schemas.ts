import { z } from "zod";

export const ingestParserSchema = z
  .object({
    sourceType: z.enum(["sms", "notification", "paste", "receipt_image"]),
    rawPayload: z.string().trim().max(50_000).optional(),
    imageBase64: z.string().trim().min(32).max(6_000_000).optional(),
    imageMimeType: z
      .enum(["image/jpeg", "image/png", "image/webp", "image/gif"])
      .optional(),
    sender: z.string().trim().min(1).max(120).optional(),
    packageName: z.string().trim().min(1).max(180).optional(),
    receivedAt: z.string().datetime().optional(),
    deviceKey: z.string().trim().min(1).max(255).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasText = Boolean(value.rawPayload?.trim());
    const hasImage = Boolean(value.imageBase64);
    if (!hasText && !hasImage) {
      ctx.addIssue({
        code: "custom",
        message: "Provide receipt text (rawPayload) and/or an image (imageBase64)",
        path: ["rawPayload"],
      });
    }
    if (value.sourceType === "receipt_image" && !hasImage) {
      ctx.addIssue({
        code: "custom",
        message: "receipt_image requires imageBase64",
        path: ["imageBase64"],
      });
    }
    if (value.sourceType === "paste" && !hasText) {
      ctx.addIssue({
        code: "custom",
        message: "paste requires rawPayload text",
        path: ["rawPayload"],
      });
    }
  });

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
