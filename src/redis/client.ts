import { Redis } from "ioredis";
import config from "../config/index.js";
import { logger } from "../observability/logger.js";
import { createRedisClient } from "./options.js";

export const redis: Redis = createRedisClient();

redis.on("error", (err: Error) => {
  logger.error({ err: { message: err.message } }, "redis_error");
});

export async function connectRedis(): Promise<void> {
  await redis.ping();
  logger.info(
    {
      provider: config.redis.url.startsWith("rediss://") ? "upstash-or-tls" : "local",
    },
    "redis_connected"
  );
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
