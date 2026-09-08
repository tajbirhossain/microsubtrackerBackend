import { closePool } from "../db/pool.js";
import { closeQueue } from "../jobs/queues.js";
import { startWorkers, stopWorkers } from "../jobs/worker.js";
import { closeRedis, connectRedis } from "../redis/client.js";

async function main(): Promise<void> {
  await connectRedis();
  const worker = await startWorkers();

  async function shutdown(signal: string): Promise<void> {
    console.log(`Received ${signal}. Stopping worker...`);
    try {
      await stopWorkers(worker);
      await closeQueue();
      await Promise.all([closePool(), closeRedis()]);
      process.exit(0);
    } catch (error) {
      console.error("Worker shutdown failed", error);
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
  console.error("Worker failed to start", error);
  process.exit(1);
});
