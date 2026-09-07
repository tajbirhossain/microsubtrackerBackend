import { closePool } from "../db/pool.js";
import { runMigrations } from "../db/migrate.js";

async function main(): Promise<void> {
  try {
    await runMigrations();
  } finally {
    await closePool();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exitCode = 1;
});
