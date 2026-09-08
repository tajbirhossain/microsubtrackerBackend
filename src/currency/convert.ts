import { roundMoney } from "../utils/money.js";

/**
 * Convert using USD-pivot rates: `rates[code]` = units of code per 1 base unit.
 * Example: rates.EUR = 0.92 means 1 USD = 0.92 EUR when base is USD.
 */
export function convertAmount(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number>,
  base: string
): number {
  const fromCode = from.toUpperCase();
  const toCode = to.toUpperCase();
  const baseCode = base.toUpperCase();

  if (!Number.isFinite(amount)) {
    throw new Error("Amount must be a finite number");
  }

  if (fromCode === toCode) {
    return roundMoney(amount);
  }

  const rateOrBase = (code: string): number => {
    if (code === baseCode) return 1;
    const rate = rates[code];
    if (typeof rate !== "number" || !(rate > 0)) {
      throw new Error(`Missing FX rate for ${code}`);
    }
    return rate;
  };

  const fromRate = rateOrBase(fromCode);
  const toRate = rateOrBase(toCode);

  // amount_in_base = amount / fromRate; amount_in_to = amount_in_base * toRate
  return roundMoney((amount / fromRate) * toRate);
}

export function getRate(
  from: string,
  to: string,
  rates: Record<string, number>,
  base: string
): number {
  return convertAmount(1, from, to, rates, base);
}
