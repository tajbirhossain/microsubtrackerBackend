import { closePool } from "../db/pool.js";
import {
  enqueueCurrencyRateUpdate,
  enqueueExpiredSessionCleanup,
  enqueueGhostDetection,
  enqueueMonthlyCalculations,
  enqueueRenewalReminders,
  enqueueTrialReminders,
} from "../jobs/producers.js";
import { closeQueue } from "../jobs/queues.js";
import { closeRedis, connectRedis } from "../redis/client.js";

async function main(): Promise<void> {
  await connectRedis();

  const ids = await Promise.all([
    enqueueTrialReminders(),
    enqueueRenewalReminders(),
    enqueueGhostDetection(),
    enqueueCurrencyRateUpdate(),
    enqueueMonthlyCalculations(),
    enqueueExpiredSessionCleanup(),
  ]);

  console.info("Enqueued jobs:", ids.filter(Boolean));

  await closeQueue();
  await Promise.all([closePool(), closeRedis()]);
}

main().catch(async (error) => {
  console.error("Failed to enqueue jobs", error);
  await Promise.allSettled([closeQueue(), closePool(), closeRedis()]);
  process.exit(1);
});
