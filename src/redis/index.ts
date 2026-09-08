export { redis, connectRedis, closeRedis, redisKey } from "./client.js";
export { cacheGet, cacheSet, cacheDel } from "./cache.js";
export {
  getCachedCurrencyRates,
  setCachedCurrencyRates,
  invalidateCurrencyRates,
  type CachedCurrencyRates,
} from "./currency-cache.js";
export {
  getCachedSession,
  setCachedSession,
  deleteCachedSession,
  type CachedSession,
} from "./session.js";
export {
  runIdempotent,
  hashIdempotencyRequest,
  type IdempotentResponse,
} from "./idempotency.js";
export { getQueueConnection, getQueueRedis } from "./queue.js";
export { checkRedisHealth, type RedisHealth } from "./health.js";

// Job queue lives in src/jobs (BullMQ). Use getQueueConnection() from there.
