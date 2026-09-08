import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/errors.js";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Mutating API calls must declare JSON (or send an empty body).
 * Blocks simple CSRF-style form posts against cookie-less JSON APIs less,
 * but mainly rejects unexpected content types early.
 */
export function requireJsonContentType(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (!MUTATING.has(req.method)) {
    next();
    return;
  }

  const contentType = req.header("content-type");
  const hasBody =
    req.headers["content-length"] !== undefined &&
    req.headers["content-length"] !== "0";

  if (!hasBody && contentType === undefined) {
    next();
    return;
  }

  if (
    contentType &&
    !contentType.toLowerCase().includes("application/json") &&
    !contentType.toLowerCase().includes("application/x-www-form-urlencoded")
  ) {
    next(
      new AppError(
        415,
        "Unsupported Media Type — use application/json"
      )
    );
    return;
  }

  next();
}
