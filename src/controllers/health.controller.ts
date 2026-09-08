import type { Request, Response, NextFunction } from "express";
import { checkDatabaseHealth } from "../db/health.js";
import { checkRedisHealth } from "../redis/health.js";

export function getHealth(_req: Request, res: Response): void {
  res.json({
    success: true,
    message: "Micro Subscription Tracker API is running",
    timestamp: new Date().toISOString(),
  });
}

export async function getReady(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const [database, redisHealth] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(),
    ]);

    const ready = database.ok && redisHealth.ok;

    res.status(ready ? 200 : 503).json({
      success: ready,
      message: ready ? "Service ready" : "Service not ready",
      data: {
        database: database.ok ? "up" : "down",
        databaseLatencyMs: database.latencyMs,
        redis: redisHealth.ok ? "up" : "down",
        redisLatencyMs: redisHealth.latencyMs,
        ...(database.error ? { databaseError: database.error } : {}),
        ...(redisHealth.error ? { redisError: redisHealth.error } : {}),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}
