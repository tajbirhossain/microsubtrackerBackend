import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import config from "../config/index.js";
import { AppError } from "../utils/errors.js";

function tokensEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * Protects analytics read endpoints.
 * Pass token via `X-Analytics-Admin-Token` header.
 */
export function requireAnalyticsAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const expected = config.security.analyticsAdminToken;
  if (!expected) {
    next(
      new AppError(
        503,
        "Analytics admin access is not configured (set ANALYTICS_ADMIN_TOKEN)"
      )
    );
    return;
  }

  const provided = req.header("x-analytics-admin-token")?.trim();
  if (!provided || !tokensEqual(provided, expected)) {
    next(new AppError(401, "Invalid or missing analytics admin token"));
    return;
  }

  next();
}
