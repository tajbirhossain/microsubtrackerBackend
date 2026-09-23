import { z } from "zod";

export const checkoutBodySchema = z.object({
  plan: z.enum(["plus", "pro"]),
});

export const confirmBodySchema = z.object({
  transactionId: z.string().min(3),
});

export type CheckoutBody = z.infer<typeof checkoutBodySchema>;
export type ConfirmBody = z.infer<typeof confirmBodySchema>;
