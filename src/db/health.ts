import { queryOne } from "./query.js";
import { getPoolStats } from "./pool.js";

export type DatabaseHealth = {
  ok: boolean;
  latencyMs: number;
  pool: {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  };
  error?: string;
};

export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  const started = Date.now();
  const pool = getPoolStats();

  try {
    await queryOne<{ ok: number }>("SELECT 1 AS ok");
    return {
      ok: true,
      latencyMs: Date.now() - started,
      pool,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown database error";
    return {
      ok: false,
      latencyMs: Date.now() - started,
      pool,
      error: message,
    };
  }
}
