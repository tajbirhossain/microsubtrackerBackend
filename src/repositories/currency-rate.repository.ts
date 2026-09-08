import type { Queryable } from "../db/query.js";
import { query, queryAll, queryOne } from "../db/query.js";
import type { CurrencyRateRow } from "../types/database.js";

export type UpsertCurrencyRateInput = {
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  source: string;
  fetchedAt: Date | string;
};

export async function upsertCurrencyRates(
  rates: UpsertCurrencyRateInput[],
  client?: Queryable
): Promise<number> {
  if (rates.length === 0) return 0;

  let written = 0;
  for (const rate of rates) {
    if (rate.baseCurrency === rate.quoteCurrency) continue;

    await query(
      `
        INSERT INTO currency_rates (
          base_currency,
          quote_currency,
          rate,
          source,
          fetched_at
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (base_currency, quote_currency)
        DO UPDATE SET
          rate = EXCLUDED.rate,
          source = EXCLUDED.source,
          fetched_at = EXCLUDED.fetched_at
      `,
      [
        rate.baseCurrency,
        rate.quoteCurrency,
        rate.rate,
        rate.source,
        rate.fetchedAt,
      ],
      client
    );
    written += 1;
  }

  return written;
}

export async function listRatesForBase(
  baseCurrency: string,
  client?: Queryable
): Promise<CurrencyRateRow[]> {
  return queryAll<CurrencyRateRow>(
    `
      SELECT *
      FROM currency_rates
      WHERE base_currency = $1
      ORDER BY quote_currency ASC
    `,
    [baseCurrency.toUpperCase()],
    client
  );
}

export async function findRatePair(
  baseCurrency: string,
  quoteCurrency: string,
  client?: Queryable
): Promise<CurrencyRateRow | null> {
  return queryOne<CurrencyRateRow>(
    `
      SELECT *
      FROM currency_rates
      WHERE base_currency = $1
        AND quote_currency = $2
      LIMIT 1
    `,
    [baseCurrency.toUpperCase(), quoteCurrency.toUpperCase()],
    client
  );
}

export async function getLatestFetchedAt(
  baseCurrency: string,
  client?: Queryable
): Promise<Date | null> {
  const row = await queryOne<{ fetched_at: Date }>(
    `
      SELECT MAX(fetched_at) AS fetched_at
      FROM currency_rates
      WHERE base_currency = $1
    `,
    [baseCurrency.toUpperCase()],
    client
  );
  return row?.fetched_at ?? null;
}
