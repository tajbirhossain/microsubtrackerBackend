import { closePool } from "../db/pool.js";
import { runMigrations } from "../db/migrate.js";
import { logger } from "../observability/logger.js";

async function main(): Promise<void> {
  try {
    await runMigrations();
  } finally {
    try {
      await closePool();
    } catch {
      // migrate uses its own pool; app pool close is best-effort
    }
  }
}

main().catch((error) => {
  logger.error(
    { err: error instanceof Error ? error.message : String(error) },
    "migration_failed"
  );
  console.error("Migration failed:", error);
  process.exitCode = 1;
});
