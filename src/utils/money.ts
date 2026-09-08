import type { BillingCycle, SpendScale } from "../types/index.js";

export function toMonthlyAmount(amount: number, cycle: BillingCycle): number {
  switch (cycle) {
    case "weekly":
      return (amount * 52) / 12;
    case "yearly":
      return amount / 12;
    default:
      return amount;
  }
}

export function toYearlyAmount(amount: number, cycle: BillingCycle): number {
  switch (cycle) {
    case "weekly":
      return amount * 52;
    case "monthly":
      return amount * 12;
    default:
      return amount;
  }
}

export function scaleForAmount(amount: number, cycle: BillingCycle): SpendScale {
  return toMonthlyAmount(amount, cycle) >= 20 ? "macro" : "micro";
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
