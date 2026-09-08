import type { NextFunction, Request, Response } from "express";
import config from "../config/index.js";
import { AppError } from "../utils/errors.js";
import { redis, redisKey } from "../redis/client.js";

function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]!.trim();
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

async function consumeLimit(input: {
  bucketKey: string;
  max: number;
  windowSeconds: number;
  res: Response;
}): Promise<boolean> {
  const count = await redis.incr(input.bucketKey);
  if (count === 1) {
    await redis.expire(input.bucketKey, input.windowSeconds);
  }

  const remaining = Math.max(0, input.max - count);
  input.res.setHeader("X-RateLimit-Limit", String(input.max));
  input.res.setHeader("X-RateLimit-Remaining", String(remaining));
  input.res.setHeader("X-RateLimit-Window", String(input.windowSeconds));

  return count <= input.max;
}

/**
 * Fixed-window rate limiter backed by Redis INCR + EXPIRE.
 */
export function rateLimit(options?: {
  max?: number;
  windowSeconds?: number;
  prefix?: string;
}) {
  const max = options?.max ?? config.redis.rateLimitMax;
  const windowSeconds =
    options?.windowSeconds ?? config.redis.rateLimitWindowSeconds;
  const prefix = options?.prefix ?? "rl";

  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const ip = clientIp(req);
      const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
      const key = redisKey(prefix, ip, String(bucket));

      const allowed = await consumeLimit({
        bucketKey: key,
        max,
        windowSeconds,
        res,
      });

      if (!allowed) {
        next(new AppError(429, "Too many requests"));
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Per-authenticated-user limiter (applied after requireAuth). */
export function userRateLimit(options?: {
  max?: number;
  windowSeconds?: number;
}) {
  const max = options?.max ?? config.security.userRateLimitMax;
  const windowSeconds =
    options?.windowSeconds ?? config.redis.rateLimitWindowSeconds;

  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        next();
        return;
      }

      const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
      const key = redisKey("rl:user", userId, String(bucket));
      const allowed = await consumeLimit({
        bucketKey: key,
        max,
        windowSeconds,
        res,
      });

      if (!allowed) {
        next(new AppError(429, "Too many requests for this account"));
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
