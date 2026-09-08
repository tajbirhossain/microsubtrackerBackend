import { redis, redisKey } from "../redis/client.js";
import { getPoolStats } from "../db/pool.js";
import { logger } from "./logger.js";

const LOCAL = {
  httpRequests: 0,
  httpErrors: 0,
  httpDurationMsTotal: 0,
  httpDurationMsMax: 0,
  startedAt: Date.now(),
};

function dayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

async function incr(key: string, by = 1): Promise<void> {
  try {
    const count = await redis.incrby(key, by);
    if (count === by) {
      await redis.expire(key, 60 * 60 * 24 * 14);
    }
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      "metrics incr failed"
    );
  }
}

export async function recordHttpRequest(input: {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
}): Promise<void> {
  LOCAL.httpRequests += 1;
  LOCAL.httpDurationMsTotal += input.durationMs;
  LOCAL.httpDurationMsMax = Math.max(LOCAL.httpDurationMsMax, input.durationMs);
  if (input.statusCode >= 500) {
    LOCAL.httpErrors += 1;
  }

  const day = dayKey();
  const route = input.route.slice(0, 120) || "unknown";
  await Promise.all([
    incr(redisKey("metrics", "http", "requests", day)),
    incr(redisKey("metrics", "http", "duration_ms", day), input.durationMs),
    incr(
      redisKey(
        "metrics",
        "http",
        "status",
        day,
        String(Math.floor(input.statusCode / 100) * 100)
      )
    ),
    incr(redisKey("metrics", "http", "route", day, input.method, route)),
    input.statusCode >= 500
      ? incr(redisKey("metrics", "http", "errors", day))
      : Promise.resolve(),
  ]);
}

export async function recordJobResult(input: {
  jobName: string;
  outcome: "completed" | "failed";
  durationMs?: number;
}): Promise<void> {
  const day = dayKey();
  await Promise.all([
    incr(redisKey("metrics", "jobs", input.outcome, day)),
    incr(redisKey("metrics", "jobs", input.outcome, day, input.jobName)),
    input.durationMs
      ? incr(
          redisKey("metrics", "jobs", "duration_ms", day, input.jobName),
          input.durationMs
        )
      : Promise.resolve(),
  ]);
}

export async function recordError(kind = "unhandled"): Promise<void> {
  LOCAL.httpErrors += 1;
  await incr(redisKey("metrics", "errors", dayKey(), kind));
}

async function readInt(key: string): Promise<number> {
  try {
    const value = await redis.get(key);
    return value ? Number(value) || 0 : 0;
  } catch {
    return 0;
  }
}

export function getDatabasePoolMetrics() {
  return getPoolStats();
}

export async function getMetricsSnapshot(): Promise<{
  process: {
    uptimeSeconds: number;
    httpRequests: number;
    httpErrors: number;
    avgDurationMs: number;
    maxDurationMs: number;
    memoryRssMb: number;
  };
  databasePool: ReturnType<typeof getDatabasePoolMetrics>;
  today: {
    httpRequests: number;
    httpErrors: number;
    httpDurationMs: number;
    jobsCompleted: number;
    jobsFailed: number;
  };
}> {
  const day = dayKey();
  const [
    httpRequests,
    httpErrors,
    httpDurationMs,
    jobsCompleted,
    jobsFailed,
  ] = await Promise.all([
    readInt(redisKey("metrics", "http", "requests", day)),
    readInt(redisKey("metrics", "http", "errors", day)),
    readInt(redisKey("metrics", "http", "duration_ms", day)),
    readInt(redisKey("metrics", "jobs", "completed", day)),
    readInt(redisKey("metrics", "jobs", "failed", day)),
  ]);

  const mem = process.memoryUsage();

  return {
    process: {
      uptimeSeconds: Math.round((Date.now() - LOCAL.startedAt) / 1000),
      httpRequests: LOCAL.httpRequests,
      httpErrors: LOCAL.httpErrors,
      avgDurationMs:
        LOCAL.httpRequests > 0
          ? Math.round(LOCAL.httpDurationMsTotal / LOCAL.httpRequests)
          : 0,
      maxDurationMs: LOCAL.httpDurationMsMax,
      memoryRssMb: Math.round((mem.rss / (1024 * 1024)) * 10) / 10,
    },
    databasePool: getDatabasePoolMetrics(),
    today: {
      httpRequests,
      httpErrors,
      httpDurationMs,
      jobsCompleted,
      jobsFailed,
    },
  };
}
