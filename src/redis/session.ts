import config from "../config/index.js";
import { cacheDel, cacheGet, cacheSet } from "./cache.js";

export type CachedSession = {
  userId: string;
  deviceId: string | null;
  refreshTokenId: string;
  expiresAt: string;
};

export async function getCachedSession(
  refreshTokenHash: string
): Promise<CachedSession | null> {
  return cacheGet<CachedSession>(["session", "refresh", refreshTokenHash]);
}

export async function setCachedSession(
  refreshTokenHash: string,
  session: CachedSession,
  ttlSeconds = config.redis.sessionTtlSeconds
): Promise<void> {
  await cacheSet(["session", "refresh", refreshTokenHash], session, ttlSeconds);
}

export async function deleteCachedSession(
  refreshTokenHash: string
): Promise<void> {
  await cacheDel("session", "refresh", refreshTokenHash);
}
