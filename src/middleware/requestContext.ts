import type { NextFunction, Request, Response } from "express";
import { createRequestId, logger } from "../observability/logger.js";
import { recordHttpRequest } from "../observability/metrics.js";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      log?: import("pino").Logger;
    }
  }
}

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = createRequestId(
    req.header("x-request-id") ?? req.header("X-Request-Id")
  );
  req.requestId = requestId;
  req.log = logger.child({ request_id: requestId });
  res.setHeader("X-Request-Id", requestId);
  next();
}

function routeLabel(req: Request): string {
  const routePath = req.route?.path;
  const base = req.baseUrl || "";
  if (typeof routePath === "string") {
    return `${base}${routePath}` || req.path;
  }
  // Fall back to path without raw IDs where possible
  return (req.originalUrl || req.path).split("?")[0] ?? req.path;
}

/**
 * Emits the Backend.txt-style access log:
 * request_id / method / path / user_id / duration / status
 */
export function requestLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const url = req.originalUrl || req.url || req.path;
  if (url.startsWith("/api/health")) {
    next();
    return;
  }

  const started = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    const rounded = Math.round(durationMs * 10) / 10;
    const route = routeLabel(req);
    const status = res.statusCode;
    const userId = req.user?.id;

    const log = req.log ?? logger;
    const payload = {
      request_id: req.requestId,
      method: req.method,
      path: route,
      user_id: userId,
      duration_ms: rounded,
      status,
    };

    if (status >= 500) {
      log.error(payload, "request_completed");
    } else if (status >= 400) {
      log.warn(payload, "request_completed");
    } else {
      log.info(payload, "request_completed");
    }

    void recordHttpRequest({
      method: req.method,
      route,
      statusCode: status,
      durationMs: rounded,
    });
  });

  next();
}
