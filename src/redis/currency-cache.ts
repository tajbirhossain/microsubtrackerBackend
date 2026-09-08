import config from "../config/index.js";
import { cacheDel, cacheGet, cacheSet } from "./cache.js";

export type CachedCurrencyRates = {
  base: string;
  rates: Record<string, number>;
  fetchedAt: string;
  source: string;
};

export async function getCachedCurrencyRates(
  base = "USD"
): Promise<CachedCurrencyRates | null> {
  return cacheGet<CachedCurrencyRates>(["currency", "rates", base.toUpperCase()]);
}

export async function setCachedCurrencyRates(
  payload: CachedCurrencyRates,
  ttlSeconds = config.redis.currencyCacheTtlSeconds
): Promise<void> {
  await cacheSet(
    ["currency", "rates", payload.base.toUpperCase()],
    payload,
    ttlSeconds
  );
}

export async function invalidateCurrencyRates(base = "USD"): Promise<void> {
  await cacheDel("currency", "rates", base.toUpperCase());
}
