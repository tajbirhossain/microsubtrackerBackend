/** Currencies the Android app already exposes in the currency selector. */
export const SUPPORTED_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "INR",
  "BDT",
  "JPY",
  "SGD",
  "AED",
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const DEFAULT_CURRENCY_BASE: SupportedCurrency = "USD";

/** Last-resort seed rates (USD → quote). Matches the frontend demo table. */
export const SEED_RATES_FROM_USD: Record<SupportedCurrency, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.36,
  AUD: 1.53,
  INR: 83.2,
  BDT: 109.5,
  JPY: 149.8,
  SGD: 1.34,
  AED: 3.67,
};

export function isSupportedCurrency(code: string): code is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(code.toUpperCase());
}
