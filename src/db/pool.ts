import pg from "pg";
import config, { toPoolConfig } from "../config/index.js";
import { logger } from "../observability/logger.js";

const { Pool } = pg;

export const pool = new Pool(toPoolConfig(config.database));

if (config.database.isSupabase) {
  logger.info(
    {
      poolMax: config.database.poolMax,
      idleTimeoutMs: config.database.idleTimeoutMs,
      note: "API and worker each open their own pool — keep DB_POOL_MAX ≤ 3 on free tier",
    },
    "supabase_pool_tuned"
  );
}

pool.on("error", (err) => {
  logger.error(
    { err: { message: err.message, stack: err.stack } },
    "postgres_pool_error"
  );
});

export function getPoolStats() {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}

export async function closePool(): Promise<void> {
  await pool.end();
  logger.info("postgres_pool_closed");
}
