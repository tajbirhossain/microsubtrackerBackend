import type { NextFunction, Request, Response } from "express";
import config from "../config/index.js";
import { isAppError } from "../utils/errors.js";
import type { HttpError } from "../types/index.js";

function publicMessage(statusCode: number, message: string): string {
  if (statusCode >= 500 && !config.isDev) {
    return "Internal Server Error";
  }
  return message || "Request failed";
}

export function errorHandler(
  err: HttpError | Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const appErr = isAppError(err) ? err : null;
  const statusCode = appErr?.statusCode ?? 500;
  const message = publicMessage(
    statusCode,
    appErr?.message ?? (err instanceof Error ? err.message : "Internal Server Error")
  );

  if (statusCode >= 500) {
    console.error(err);
  }

  const details =
    appErr?.details !== undefined && (config.isDev || statusCode < 500)
      ? appErr.details
      : undefined;

  res.status(statusCode).json({
    success: false,
    message,
    ...(details !== undefined ? { details } : {}),
    ...(config.isDev && err instanceof Error && err.stack
      ? { stack: err.stack }
      : {}),
  });
}
