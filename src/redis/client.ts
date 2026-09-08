import { Redis } from "ioredis";
import config from "../config/index.js";

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

redis.on("error", (err: Error) => {
  console.error("Redis error", err);
});

export async function connectRedis(): Promise<void> {
  await redis.ping();
}

export async function closeRedis(): Promise<void> {
  if (redis.status === "end") {
    return;
  }
  await redis.quit();
}

export function redisKey(...parts: string[]): string {
  return `${config.redis.keyPrefix}${parts.join(":")}`;
}
