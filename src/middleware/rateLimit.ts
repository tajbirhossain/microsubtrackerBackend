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

      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }

      const remaining = Math.max(0, max - count);
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", String(remaining));
      res.setHeader("X-RateLimit-Window", String(windowSeconds));

      if (count > max) {
        next(new AppError(429, "Too many requests"));
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
