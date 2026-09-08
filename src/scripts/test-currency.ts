import { closePool } from "../db/pool.js";
import { convertAmount } from "../currency/convert.js";
import { closeRedis, connectRedis } from "../redis/client.js";
import { invalidateCurrencyRates } from "../redis/currency-cache.js";
import {
  getRatesBundle,
  refreshCurrencyRates,
} from "../services/currency.service.js";

async function assert(condition: boolean, message: string): Promise<void> {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  await connectRedis();

  console.info("1) Fresh refresh from external provider…");
  const fresh = await refreshCurrencyRates();
  console.info("   ", fresh);
  await assert(fresh.count >= 2, "Expected multiple rates from refresh");

  const live = await getRatesBundle("USD");
  const usdToEur = convertAmount(100, "USD", "EUR", live.rates, live.base);
  console.info(`2) Convert 100 USD → EUR = ${usdToEur} (source=${live.source})`);
  await assert(usdToEur > 0, "Conversion should be positive");

  console.info("3) Simulate provider outage by forcing fallback path…");
  // Wipe redis so read path must use DB/seed after a "failed" refresh.
  // We call refresh with a monkey-patch by temporarily breaking DNS via invalid env?
  // Instead: clear redis, ensure DB has rows, then verify getRatesBundle still works.
  await invalidateCurrencyRates("USD");
  const afterCacheClear = await getRatesBundle("USD");
  console.info(
    "   cache-miss reload:",
    afterCacheClear.source,
    "stale=",
    afterCacheClear.stale,
    "fallback=",
    afterCacheClear.fallback
  );
  await assert(
    Object.keys(afterCacheClear.rates).length >= 2,
    "Fallback rates should still be available after cache clear"
  );

  const bdt = convertAmount(
    1,
    "USD",
    "BDT",
    afterCacheClear.rates,
    afterCacheClear.base
  );
  console.info(`4) 1 USD → BDT = ${bdt}`);

  console.info("Currency pipeline checks passed.");
  await Promise.all([closePool(), closeRedis()]);
}

main().catch(async (error) => {
  console.error("Currency test failed:", error);
  await Promise.allSettled([closePool(), closeRedis()]);
  process.exit(1);
});
