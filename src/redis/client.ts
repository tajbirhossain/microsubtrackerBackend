import { Redis } from "ioredis";
import config from "../config/index.js";
import { logger } from "../observability/logger.js";

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

redis.on("error", (err: Error) => {
  logger.error({ err: { message: err.message } }, "redis_error");
});

export async function connectRedis(): Promise<void> {
  await redis.ping();
  logger.info("redis_connected");
}

export async function closeRedis(): Promise<void> {
  if (redis.status === "end") {
    return;
  }
  await redis.quit();
  logger.info("redis_closed");
}

export function redisKey(...parts: string[]): string {
  return `${config.redis.keyPrefix}${parts.join(":")}`;
}
