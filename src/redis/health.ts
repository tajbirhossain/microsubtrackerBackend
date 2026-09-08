import { redis } from "./client.js";

export type RedisHealth = {
  ok: boolean;
  latencyMs: number;
  error?: string;
};

export async function checkRedisHealth(): Promise<RedisHealth> {
  const started = Date.now();
  try {
    const pong = await redis.ping();
    return {
      ok: pong === "PONG",
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : "Unknown Redis error",
    };
  }
}
