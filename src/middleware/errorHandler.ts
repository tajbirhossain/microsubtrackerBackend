import type { NextFunction, Request, Response } from "express";
import config from "../config/index.js";
import { captureErrorFromRequest } from "../observability/errors.js";
import { isAppError } from "../utils/errors.js";
import type { HttpError } from "../types/index.js";

function publicMessage(
  statusCode: number,
  message: string,
  isAppError: boolean
): string {
  if (isAppError) {
    return message || "Request failed";
  }
  if (statusCode >= 500 && !config.isDev) {
    return "Internal Server Error";
  }
  return message || "Request failed";
}

export function errorHandler(
  err: HttpError | Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const appErr = isAppError(err) ? err : null;
  const statusCode = appErr?.statusCode ?? 500;
  const message = publicMessage(
    statusCode,
    appErr?.message ??
      (err instanceof Error ? err.message : "Internal Server Error"),
    Boolean(appErr)
  );

  if (statusCode >= 500) {
    void captureErrorFromRequest(err, req, statusCode);
  } else if (statusCode >= 400) {
    req.log?.warn(
      {
        request_id: req.requestId,
        user_id: req.user?.id,
        method: req.method,
        path: req.originalUrl,
        status: statusCode,
        message,
      },
      "request_error"
    );
  }

  const details =
    appErr?.details !== undefined && (config.isDev || statusCode < 500)
      ? appErr.details
      : undefined;

  res.status(statusCode).json({
    success: false,
    message,
    requestId: req.requestId,
    ...(details !== undefined ? { details } : {}),
    ...(config.isDev && err instanceof Error && err.stack
      ? { stack: err.stack }
      : {}),
  });
}
