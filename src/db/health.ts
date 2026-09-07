import { queryOne } from "./query.js";

export type DatabaseHealth = {
  ok: boolean;
  latencyMs: number;
  error?: string;
};

export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  const started = Date.now();

  try {
    await queryOne<{ ok: number }>("SELECT 1 AS ok");
    return {
      ok: true,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error";
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: message,
    };
  }
}
