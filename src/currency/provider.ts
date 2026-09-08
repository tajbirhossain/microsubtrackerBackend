import {
  DEFAULT_CURRENCY_BASE,
  SEED_RATES_FROM_USD,
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from "./constants.js";

export type ExternalRatesResult = {
  base: string;
  rates: Record<string, number>;
  fetchedAt: string;
  source: string;
};

function pickSupportedRates(
  raw: Record<string, number>,
  base: string
): Record<string, number> {
  const rates: Record<string, number> = {};
  for (const code of SUPPORTED_CURRENCIES) {
    if (code === base) {
      rates[code] = 1;
      continue;
    }
    const value = raw[code];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      rates[code] = value;
    }
  }
  return rates;
}

/**
 * Primary provider: open.er-api.com (no API key, broad currency coverage).
 * Docs: https://www.exchangerate-api.com/docs/free
 */
async function fetchOpenErApi(base: string): Promise<ExternalRatesResult> {
  const response = await fetch(
    `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`,
    {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    }
  );

  if (!response.ok) {
    throw new Error(`open.er-api HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    result?: string;
    base_code?: string;
    rates?: Record<string, number>;
    time_last_update_utc?: string;
  };

  if (payload.result !== "success" || !payload.rates) {
    throw new Error("open.er-api returned an unsuccessful payload");
  }

  const rates = pickSupportedRates(payload.rates, base);
  if (Object.keys(rates).length < 2) {
    throw new Error("open.er-api returned too few supported rates");
  }

  return {
    base,
    rates,
    fetchedAt: payload.time_last_update_utc
      ? new Date(payload.time_last_update_utc).toISOString()
      : new Date().toISOString(),
    source: "open.er-api.com",
  };
}

/**
 * Secondary provider: Frankfurter (ECB). Missing some quotes (BDT/AED);
 * we fill gaps from seed rates so the supported set stays complete.
 */
async function fetchFrankfurter(base: string): Promise<ExternalRatesResult> {
  const response = await fetch(
    `https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}`,
    {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    }
  );

  if (!response.ok) {
    throw new Error(`frankfurter HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    base?: string;
    rates?: Record<string, number>;
    date?: string;
  };

  if (!payload.rates) {
    throw new Error("frankfurter returned no rates");
  }

  const rates = pickSupportedRates(payload.rates, base);
  for (const code of SUPPORTED_CURRENCIES) {
    if (rates[code] === undefined && code !== base) {
      rates[code] = SEED_RATES_FROM_USD[code as SupportedCurrency];
    }
  }

  return {
    base,
    rates,
    fetchedAt: payload.date
      ? new Date(`${payload.date}T00:00:00.000Z`).toISOString()
      : new Date().toISOString(),
    source: "frankfurter.app",
  };
}

export async function fetchExternalRates(
  base = DEFAULT_CURRENCY_BASE
): Promise<ExternalRatesResult> {
  const normalized = base.toUpperCase();
  const errors: string[] = [];

  try {
    return await fetchOpenErApi(normalized);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  try {
    return await fetchFrankfurter(normalized);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  throw new Error(`All currency providers failed: ${errors.join(" | ")}`);
}

export function seedRatesBundle(
  base = DEFAULT_CURRENCY_BASE
): ExternalRatesResult {
  return {
    base,
    rates: { ...SEED_RATES_FROM_USD },
    fetchedAt: new Date(0).toISOString(),
    source: "seed",
  };
}
