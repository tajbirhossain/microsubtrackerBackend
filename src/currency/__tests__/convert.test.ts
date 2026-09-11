import { convertAmount, getRate } from "../convert.js";

const rates = { USD: 1, BDT: 110, EUR: 0.92 };

describe("convertAmount", () => {
  test("returns rounded amount when currencies match", () => {
    expect(convertAmount(50.126, "BDT", "BDT", rates, "USD")).toBe(50.13);
  });

  test("BDT to USD divides by BDT rate", () => {
    expect(convertAmount(110, "BDT", "USD", rates, "USD")).toBe(1);
  });

  test("USD to BDT multiplies by BDT rate", () => {
    expect(convertAmount(1, "USD", "BDT", rates, "USD")).toBe(110);
  });

  test("USD to EUR uses quote rate", () => {
    expect(convertAmount(100, "USD", "EUR", rates, "USD")).toBe(92);
  });

  test("EUR to BDT pivots through USD", () => {
    // 92 EUR = 100 USD = 11000 BDT
    expect(convertAmount(92, "EUR", "BDT", rates, "USD")).toBe(11000);
  });

  test("is case-insensitive for currency codes", () => {
    expect(convertAmount(110, "bdt", "usd", rates, "usd")).toBe(1);
  });

  test("throws when amount is not finite", () => {
    expect(() => convertAmount(Number.NaN, "USD", "EUR", rates, "USD")).toThrow(
      /finite/
    );
  });

  test("throws when a required FX rate is missing", () => {
    expect(() => convertAmount(10, "USD", "JPY", rates, "USD")).toThrow(
      /Missing FX rate for JPY/
    );
  });
});

describe("getRate", () => {
  test("returns 1 for identical currencies", () => {
    expect(getRate("USD", "USD", rates, "USD")).toBe(1);
  });

  test("returns units of quote per 1 unit of base currency", () => {
    expect(getRate("USD", "BDT", rates, "USD")).toBe(110);
  });
});
