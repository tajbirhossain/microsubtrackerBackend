import config from "../config/index.js";
import {
  convertAmount,
  DEFAULT_CURRENCY_BASE,
  fetchExternalRates,
  getRate,
  isSupportedCurrency,
  seedRatesBundle,
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from "../currency/index.js";
import {
  getCachedCurrencyRates,
  setCachedCurrencyRates,
  type CachedCurrencyRates,
} from "../redis/currency-cache.js";
import {
  listRatesForBase,
  upsertCurrencyRates,
} from "../repositories/currency-rate.repository.js";
import { AppError } from "../utils/errors.js";
import { roundMoney } from "../utils/money.js";

export type RatesBundle = CachedCurrencyRates & {
  stale: boolean;
  fallback: boolean;
};

function toRatesMap(
  rows: Array<{ quote_currency: string; rate: string | number }>,
  base: string
): Record<string, number> {
  const rates: Record<string, number> = { [base]: 1 };
  for (const row of rows) {
    rates[row.quote_currency] = Number(row.rate);
  }
  return rates;
}

function rebaseRates(bundle: RatesBundle, newBase: string): RatesBundle {
  const normalized = newBase.toUpperCase();
  if (bundle.base === normalized) {
    return {
      ...bundle,
      rates: { ...bundle.rates, [normalized]: 1 },
    };
  }

  const pivot = bundle.rates[normalized];
  if (typeof pivot !== "number" || !(pivot > 0)) {
    throw new AppError(400, `Missing FX rate for base ${normalized}`);
  }

  const rates: Record<string, number> = {};
  for (const [code, rate] of Object.entries(bundle.rates)) {
    rates[code] = rate / pivot;
  }
  rates[normalized] = 1;

  return {
    ...bundle,
    base: normalized,
    rates,
  };
}

async function loadRatesFromDb(base: string): Promise<RatesBundle | null> {
  const rows = await listRatesForBase(base);
  if (rows.length === 0) return null;

  const rates = toRatesMap(rows, base);

  const fetchedAt = rows
    .map((row) => row.fetched_at)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return {
    base,
    rates,
    fetchedAt: (fetchedAt ?? new Date()).toISOString(),
    source: rows[0]?.source ?? "postgres",
    stale: true,
    fallback: true,
  };
}

function loadSeedRates(base: string): RatesBundle {
  const seedBase = isSupportedCurrency(base) ? base : DEFAULT_CURRENCY_BASE;
  const seed = seedRatesBundle(seedBase);
  return {
    ...seed,
    stale: true,
    fallback: true,
  };
}

async function persistAndCache(bundle: {
  base: string;
  rates: Record<string, number>;
  fetchedAt: string;
  source: string;
}): Promise<RatesBundle> {
  const pairs = Object.entries(bundle.rates)
    .filter(([quote]) => quote !== bundle.base)
    .map(([quoteCurrency, rate]) => ({
      baseCurrency: bundle.base,
      quoteCurrency,
      rate,
      source: bundle.source,
      fetchedAt: bundle.fetchedAt,
    }));

  await upsertCurrencyRates(pairs);

  const cached: CachedCurrencyRates = {
    base: bundle.base,
    rates: { ...bundle.rates, [bundle.base]: 1 },
    fetchedAt: bundle.fetchedAt,
    source: bundle.source,
  };

  await setCachedCurrencyRates(
    cached,
    config.redis.currencyCacheTtlSeconds
  );

  return {
    ...cached,
    stale: false,
    fallback: false,
  };
}

/**
 * Read path: Redis → PostgreSQL → seed (always stored as USD, then rebased).
 * Does not call the external API (that is the worker's job).
 */
export async function getRatesBundle(
  base: string = DEFAULT_CURRENCY_BASE
): Promise<RatesBundle> {
  const requested = base.toUpperCase();
  if (!isSupportedCurrency(requested)) {
    throw new AppError(400, `Unsupported base currency: ${requested}`);
  }

  const storageBase = DEFAULT_CURRENCY_BASE;

  const cached = await getCachedCurrencyRates(storageBase);
  if (cached) {
    return rebaseRates(
      {
        ...cached,
        rates: { ...cached.rates, [storageBase]: 1 },
        stale: false,
        fallback: cached.source === "seed" || cached.source.includes("fallback"),
      },
      requested
    );
  }

  const fromDb = await loadRatesFromDb(storageBase);
  if (fromDb) {
    await setCachedCurrencyRates(
      {
        base: fromDb.base,
        rates: fromDb.rates,
        fetchedAt: fromDb.fetchedAt,
        source: fromDb.source,
      },
      config.redis.currencyCacheTtlSeconds
    );
    return rebaseRates(fromDb, requested);
  }

  const seed = loadSeedRates(storageBase);
  await setCachedCurrencyRates(
    {
      base: seed.base,
      rates: seed.rates,
      fetchedAt: seed.fetchedAt,
      source: seed.source,
    },
    Math.min(config.redis.currencyCacheTtlSeconds, 300)
  );
  return rebaseRates(seed, requested);
}

/**
 * Worker refresh: external API → Postgres + Redis.
 * On API failure, re-warm Redis from Postgres (or seed) and report fallback.
 */
export async function refreshCurrencyRates(
  base: string = DEFAULT_CURRENCY_BASE
): Promise<{
  base: string;
  count: number;
  source: string;
  fallback: boolean;
  fetchedAt: string;
}> {
  const normalized = base.toUpperCase();
  if (!isSupportedCurrency(normalized)) {
    throw new AppError(400, `Unsupported base currency: ${normalized}`);
  }

  try {
    const fresh = await fetchExternalRates(normalized);
    const saved = await persistAndCache(fresh);
    return {
      base: saved.base,
      count: Object.keys(saved.rates).length,
      source: saved.source,
      fallback: false,
      fetchedAt: saved.fetchedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[currency] external refresh failed: ${message}`);

    const fallback =
      (await loadRatesFromDb(normalized)) ?? loadSeedRates(normalized);

    await setCachedCurrencyRates(
      {
        base: fallback.base,
        rates: fallback.rates,
        fetchedAt: fallback.fetchedAt,
        source: `${fallback.source}:fallback`,
      },
      config.redis.currencyCacheTtlSeconds
    );

    return {
      base: fallback.base,
      count: Object.keys(fallback.rates).length,
      source: `${fallback.source}:fallback`,
      fallback: true,
      fetchedAt: fallback.fetchedAt,
    };
  }
}

export async function convertCurrency(input: {
  amount: number;
  from: string;
  to: string;
}): Promise<{
  amount: number;
  from: string;
  to: string;
  result: number;
  rate: number;
  base: string;
  source: string;
  fetchedAt: string;
  stale: boolean;
  fallback: boolean;
}> {
  const from = input.from.toUpperCase();
  const to = input.to.toUpperCase();

  if (!isSupportedCurrency(from) || !isSupportedCurrency(to)) {
    throw new AppError(400, "Unsupported currency code");
  }

  const bundle = await getRatesBundle(DEFAULT_CURRENCY_BASE);
  const result = convertAmount(
    input.amount,
    from,
    to,
    bundle.rates,
    bundle.base
  );
  const rate = getRate(from, to, bundle.rates, bundle.base);

  return {
    amount: input.amount,
    from,
    to,
    result,
    rate: roundMoney(rate * 1_000_000) / 1_000_000,
    base: bundle.base,
    source: bundle.source,
    fetchedAt: bundle.fetchedAt,
    stale: bundle.stale,
    fallback: bundle.fallback,
  };
}

export function listSupportedCurrencies(): SupportedCurrency[] {
  return [...SUPPORTED_CURRENCIES];
}

export async function getCurrencyStatus(
  base: string = DEFAULT_CURRENCY_BASE
) {
  const bundle = await getRatesBundle(base);
  return {
    base: bundle.base,
    source: bundle.source,
    fetchedAt: bundle.fetchedAt,
    stale: bundle.stale,
    fallback: bundle.fallback,
    ttlSeconds: config.redis.currencyCacheTtlSeconds,
    supported: listSupportedCurrencies(),
    rateCount: Object.keys(bundle.rates).length,
  };
}
