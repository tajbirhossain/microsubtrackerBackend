import type { Request } from "express";
import { logger } from "./logger.js";
import { recordError } from "./metrics.js";

export type ErrorContext = {
  requestId?: string;
  userId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  jobName?: string;
  jobId?: string;
};

/**
 * Central error capture for API + workers.
 * Hooks for an external tracker (Sentry, etc.) can plug in via ERROR_TRACKER_DSN later.
 */
export async function captureError(
  error: unknown,
  context: ErrorContext = {}
): Promise<void> {
  const err =
    error instanceof Error
      ? error
      : new Error(typeof error === "string" ? error : "Unknown error");

  await recordError(context.jobName ? "job" : "http");

  logger.error(
    {
      err: {
        name: err.name,
        message: err.message,
        stack: err.stack,
      },
      request_id: context.requestId,
      user_id: context.userId,
      method: context.method,
      path: context.path,
      status: context.statusCode,
      job_name: context.jobName,
      job_id: context.jobId,
    },
    "error_captured"
  );

  const dsn = process.env.ERROR_TRACKER_DSN?.trim();
  if (dsn) {
    // Placeholder for future Sentry/GlitchTip wiring — DSN present means "ready to plug in".
    logger.debug({ dsnConfigured: true }, "error_tracker_hook_available");
  }
}

export function captureErrorFromRequest(
  error: unknown,
  req: Request,
  statusCode?: number
): Promise<void> {
  return captureError(error, {
    requestId: req.requestId,
    userId: req.user?.id,
    method: req.method,
    path: req.originalUrl,
    statusCode,
  });
}
