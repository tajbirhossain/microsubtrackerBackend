import { closePool } from "../db/pool.js";
import { closeQueue } from "../jobs/queues.js";
import { startWorkers, stopWorkers } from "../jobs/worker.js";
import { logger } from "../observability/logger.js";
import { closeRedis, connectRedis } from "../redis/client.js";

async function main(): Promise<void> {
  await connectRedis();
  const worker = await startWorkers();

  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, "worker_shutdown_started");
    try {
      await stopWorkers(worker);
      await closeQueue();
      await Promise.all([closePool(), closeRedis()]);
      logger.info("worker_shutdown_complete");
      process.exit(0);
    } catch (error) {
      logger.error(
        { err: error instanceof Error ? error.message : String(error) },
        "worker_shutdown_failed"
      );
      process.exit(1);
    }
  }

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

main().catch((error) => {
  logger.error(
    { err: error instanceof Error ? error.message : String(error) },
    "worker_start_failed"
  );
  process.exit(1);
});
