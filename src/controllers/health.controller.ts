import type { Request, Response, NextFunction } from "express";
import { checkDatabaseHealth } from "../db/health.js";

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
    const database = await checkDatabaseHealth();

    if (!database.ok) {
      res.status(503).json({
        success: false,
        message: "Service not ready",
        data: {
          database: "down",
          latencyMs: database.latencyMs,
          error: database.error,
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.json({
      success: true,
      message: "Service ready",
      data: {
        database: "up",
        latencyMs: database.latencyMs,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}
