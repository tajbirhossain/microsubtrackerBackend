import type { NextFunction, Request, Response } from "express";
import { stripUntrustedIdentityFields } from "../security/identity.js";

/**
 * Removes client-supplied identity fields so handlers cannot accidentally
 * trust a forged userId from the request body or query string.
 */
export function rejectClientUserId(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
    req.body = stripUntrustedIdentityFields(
      req.body as Record<string, unknown>
    );
  }

  if (req.query && typeof req.query === "object") {
    for (const key of [
      "userId",
      "user_id",
      "ownerId",
      "owner_id",
      "accountId",
      "account_id",
    ]) {
      if (key in req.query) {
        delete (req.query as Record<string, unknown>)[key];
      }
    }
  }

  next();
}
