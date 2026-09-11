import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const getCachedCurrencyRates = jest.fn();
const setCachedCurrencyRates = jest.fn(async () => undefined);
const listRatesForBase = jest.fn();
const upsertCurrencyRates = jest.fn(async () => undefined);
const fetchExternalRates = jest.fn();

await jest.unstable_mockModule("../../redis/currency-cache.js", () => ({
  getCachedCurrencyRates,
  setCachedCurrencyRates,
  invalidateCurrencyRates: jest.fn(),
}));

await jest.unstable_mockModule(
  "../../repositories/currency-rate.repository.js",
  () => ({
    listRatesForBase,
    upsertCurrencyRates,
  })
);

await jest.unstable_mockModule("../../currency/index.js", async () => {
  const actual = await jest.requireActual<
    typeof import("../../currency/index.js")
  >("../../currency/index.js");
  return {
    ...actual,
    fetchExternalRates,
  };
});

const { getRatesBundle, refreshCurrencyRates, convertCurrency } = await import(
  "../currency.service.js"
);

const liveRates = {
  USD: 1,
  EUR: 0.92,
  BDT: 110,
  GBP: 0.79,
};

describe("currency fallback chain", () => {
  beforeEach(() => {
    getCachedCurrencyRates.mockReset();
    setCachedCurrencyRates.mockClear();
    listRatesForBase.mockReset();
    upsertCurrencyRates.mockClear();
    fetchExternalRates.mockReset();
  });

  test("getRatesBundle prefers Redis cache (live, not fallback)", async () => {
    getCachedCurrencyRates.mockResolvedValueOnce({
      base: "USD",
      rates: liveRates,
      fetchedAt: "2026-01-15T00:00:00.000Z",
      source: "open.er-api.com",
    });

    const bundle = await getRatesBundle("USD");

    expect(bundle.fallback).toBe(false);
    expect(bundle.stale).toBe(false);
    expect(bundle.rates.BDT).toBe(110);
    expect(listRatesForBase).not.toHaveBeenCalled();
  });

  test("getRatesBundle falls back to Postgres when Redis is cold", async () => {
    getCachedCurrencyRates.mockResolvedValueOnce(null);
    listRatesForBase.mockResolvedValueOnce([
      {
        quote_currency: "EUR",
        rate: "0.91",
        fetched_at: new Date("2026-01-10T00:00:00.000Z"),
        source: "postgres",
      },
      {
        quote_currency: "BDT",
        rate: "109",
        fetched_at: new Date("2026-01-10T00:00:00.000Z"),
        source: "postgres",
      },
    ]);

    const bundle = await getRatesBundle("USD");

    expect(bundle.fallback).toBe(true);
    expect(bundle.stale).toBe(true);
    expect(bundle.rates.BDT).toBe(109);
    expect(setCachedCurrencyRates).toHaveBeenCalled();
  });

  test("getRatesBundle falls back to seed rates when Redis and DB are empty", async () => {
    getCachedCurrencyRates.mockResolvedValueOnce(null);
    listRatesForBase.mockResolvedValueOnce([]);

    const bundle = await getRatesBundle("USD");

    expect(bundle.fallback).toBe(true);
    expect(bundle.stale).toBe(true);
    expect(bundle.source).toMatch(/seed/i);
    expect(bundle.rates.USD).toBe(1);
    expect(bundle.rates.BDT).toBeGreaterThan(1);
    expect(setCachedCurrencyRates).toHaveBeenCalled();
  });

  test("refreshCurrencyRates marks fallback when the external API fails", async () => {
    fetchExternalRates.mockRejectedValueOnce(new Error("provider down"));
    listRatesForBase.mockResolvedValueOnce([
      {
        quote_currency: "EUR",
        rate: "0.9",
        fetched_at: new Date("2026-01-01T00:00:00.000Z"),
        source: "postgres",
      },
    ]);

    const result = await refreshCurrencyRates("USD");

    expect(result.fallback).toBe(true);
    expect(result.source).toMatch(/fallback/);
    expect(setCachedCurrencyRates).toHaveBeenCalledWith(
      expect.objectContaining({ source: expect.stringMatching(/fallback/) }),
      expect.any(Number)
    );
  });

  test("refreshCurrencyRates persists a successful external fetch", async () => {
    fetchExternalRates.mockResolvedValueOnce({
      base: "USD",
      rates: liveRates,
      fetchedAt: "2026-01-15T12:00:00.000Z",
      source: "open.er-api.com",
    });

    const result = await refreshCurrencyRates("USD");

    expect(result.fallback).toBe(false);
    expect(upsertCurrencyRates).toHaveBeenCalled();
    expect(setCachedCurrencyRates).toHaveBeenCalled();
  });

  test("convertCurrency surfaces the fallback flag from the rates bundle", async () => {
    getCachedCurrencyRates.mockResolvedValueOnce({
      base: "USD",
      rates: liveRates,
      fetchedAt: "2026-01-15T00:00:00.000Z",
      source: "seed",
    });

    const converted = await convertCurrency({
      amount: 110,
      from: "BDT",
      to: "USD",
    });

    expect(converted.result).toBe(1);
    expect(converted.fallback).toBe(true);
  });
});
