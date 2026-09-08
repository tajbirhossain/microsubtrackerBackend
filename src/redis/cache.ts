import { redis, redisKey } from "./client.js";

export async function cacheGet<T>(keyParts: string[]): Promise<T | null> {
  const raw = await redis.get(redisKey(...keyParts));
  if (!raw) {
    return null;
  }
  return JSON.parse(raw) as T;
}

export async function cacheSet(
  keyParts: string[],
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  await redis.set(
    redisKey(...keyParts),
    JSON.stringify(value),
    "EX",
    ttlSeconds
  );
}

export async function cacheDel(...keyParts: string[]): Promise<void> {
  await redis.del(redisKey(...keyParts));
}
