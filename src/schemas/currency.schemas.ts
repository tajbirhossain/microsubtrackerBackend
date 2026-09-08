import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "../currency/constants.js";

const currencyCodeSchema = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase())
  .refine(
    (value) => (SUPPORTED_CURRENCIES as readonly string[]).includes(value),
    "Unsupported currency code"
  );

export const ratesQuerySchema = z.object({
  base: currencyCodeSchema.optional().default("USD"),
});

export const convertQuerySchema = z.object({
  amount: z.coerce.number().finite(),
  from: currencyCodeSchema,
  to: currencyCodeSchema,
});

export type RatesQuery = z.infer<typeof ratesQuerySchema>;
export type ConvertQuery = z.infer<typeof convertQuerySchema>;
