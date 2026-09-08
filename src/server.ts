import app from "./app.js";
import config from "./config/index.js";
import { closePool } from "./db/pool.js";
import { closeRedis, connectRedis } from "./redis/client.js";

async function start(): Promise<void> {
  await connectRedis();

  const server = app.listen(config.port, () => {
    console.log(
      `Server running in ${config.env} mode on http://localhost:${config.port}`
    );
  });

  async function shutdown(signal: string): Promise<void> {
    console.log(`Received ${signal}. Shutting down...`);

    server.close(async () => {
      try {
        await Promise.all([closePool(), closeRedis()]);
        console.log("PostgreSQL and Redis closed.");
        process.exit(0);
      } catch (error) {
        console.error("Error during shutdown", error);
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
  console.error("Failed to start server", error);
  process.exit(1);
});
