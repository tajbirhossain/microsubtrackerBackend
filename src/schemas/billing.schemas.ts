import { z } from "zod";

export const checkoutBodySchema = z.object({
  plan: z.enum(["plus", "pro"]),
});

export type CheckoutBody = z.infer<typeof checkoutBodySchema>;
