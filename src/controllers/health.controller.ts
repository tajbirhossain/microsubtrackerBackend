import type { Request, Response, NextFunction } from "express";
import { checkDatabaseHealth } from "../db/health.js";
import { checkRedisHealth } from "../redis/health.js";
import { getMetricsSnapshot } from "../observability/metrics.js";
import config from "../config/index.js";

export function getHealth(_req: Request, res: Response): void {
  res.json({
    success: true,
    message: "Micro Subscription Tracker API is running",
    data: {
      status: "ok",
      env: config.env,
      uptimeSeconds: Math.round(process.uptime()),
    },
    timestamp: new Date().toISOString(),
  });
}

export async function getReady(
  req: Request,
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
        database: {
          status: database.ok ? "up" : "down",
          latencyMs: database.latencyMs,
          pool: database.pool,
          ...(database.error ? { error: database.error } : {}),
        },
        redis: {
          status: redisHealth.ok ? "up" : "down",
          latencyMs: redisHealth.latencyMs,
          ...(redisHealth.error ? { error: redisHealth.error } : {}),
        },
      },
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getMetrics(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const snapshot = await getMetricsSnapshot();
    res.json({
      success: true,
      data: snapshot,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}
