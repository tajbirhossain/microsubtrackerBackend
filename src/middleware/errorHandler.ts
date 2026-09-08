import type { NextFunction, Request, Response } from "express";
import config from "../config/index.js";
import type { HttpError } from "../types/index.js";

export function errorHandler(
  err: HttpError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500;
  const message = err.message ?? "Internal Server Error";

  if (config.isDev && statusCode >= 500) {
    console.error(err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(err.details !== undefined ? { details: err.details } : {}),
    ...(config.isDev && err.stack ? { stack: err.stack } : {}),
  });
}
