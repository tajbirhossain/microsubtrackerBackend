import { z } from "zod";

export const googleConfirmBodySchema = z.object({
  productId: z.string().min(1),
  purchaseToken: z.string().min(10),
  packageName: z.string().min(3).optional(),
});

export type GoogleConfirmBody = z.infer<typeof googleConfirmBodySchema>;
