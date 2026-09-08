import app from "./app.js";
import config from "./config/index.js";
import { closePool } from "./db/pool.js";
import { logger } from "./observability/logger.js";
import { closeRedis, connectRedis } from "./redis/client.js";

async function start(): Promise<void> {
  await connectRedis();

  const server = app.listen(config.port, () => {
    logger.info(
      {
        port: config.port,
        env: config.env,
        url: `http://localhost:${config.port}`,
      },
      "server_started"
    );
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, "shutdown_started");

    server.close(async () => {
      try {
        await Promise.all([closePool(), closeRedis()]);
        logger.info("shutdown_complete");
        process.exit(0);
      } catch (error) {
        logger.error(
          { err: error instanceof Error ? error.message : String(error) },
          "shutdown_failed"
        );
        process.exit(1);
      }
    });
  }

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

start().catch((error) => {
  logger.error(
    { err: error instanceof Error ? error.message : String(error) },
    "server_start_failed"
  );
  process.exit(1);
});
