import app from "./app.js";
import config from "./config/index.js";
import { closePool } from "./db/pool.js";

const server = app.listen(config.port, () => {
  console.log(
    `Server running in ${config.env} mode on http://localhost:${config.port}`
  );
});

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}. Shutting down...`);

  server.close(async () => {
    try {
      await closePool();
      console.log("PostgreSQL pool closed.");
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
