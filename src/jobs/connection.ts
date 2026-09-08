import { Redis } from "ioredis";
import config from "../config/index.js";

/** Dedicated BullMQ connection (maxRetriesPerRequest must be null). */
export function createQueueConnection(): Redis {
  return new Redis(config.redis.url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}
