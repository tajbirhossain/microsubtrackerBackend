import type { Redis } from "ioredis";
import { createRedisClient } from "../redis/options.js";

/** Dedicated BullMQ connection (maxRetriesPerRequest must be null). */
export function createQueueConnection(): Redis {
  return createRedisClient();
}
