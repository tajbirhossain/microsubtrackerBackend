import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../utils/errors.js";

type RequestPart = "body" | "query" | "params";

export function validateRequest<T>(
  schema: ZodType<T>,
  part: RequestPart = "body"
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req[part]);

    if (!parsed.success) {
      next(
        new AppError(400, "Validation failed", parsed.error.flatten())
      );
      return;
    }

    req[part] = parsed.data as typeof req.body;
    next();
  };
}
