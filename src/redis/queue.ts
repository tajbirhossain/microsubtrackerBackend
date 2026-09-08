import config from "../config/index.js";
import { redis } from "./client.js";

/** Connection options for BullMQ / workers (section 7). */
export function getQueueConnection() {
  const url = new URL(config.redis.url);

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
    username: url.username || undefined,
    maxRetriesPerRequest: null as null,
  };
}

export function getQueueRedis() {
  return redis;
}
