import { Redis, type RedisOptions } from "ioredis";
import config from "../config/index.js";

/**
 * Shared ioredis options for app Redis + BullMQ.
 * Upstash requires TLS (`rediss://...`); local Redis uses `redis://`.
 */
export function createRedisOptions(): RedisOptions {
  const url = config.redis.url;
  const isTls = url.startsWith("rediss://");

  return {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    // Prefer IPv4 when dual-stack DNS is flaky (common on Windows + cloud hosts).
    family: 4,
    ...(isTls
      ? {
          tls: {
            rejectUnauthorized: true,
          },
        }
      : {}),
  };
}

export function createRedisClient(): Redis {
  return new Redis(config.redis.url, createRedisOptions());
}
