import { AppError } from "../utils/errors.js";

/**
 * Ownership rule for this API:
 * Always scope queries by `req.user.id` from the access token.
 * Never take `userId` / `user_id` from the client body/query.
 * Missing or cross-user rows → 404 (not 403) to avoid resource enumeration.
 */
export function assertFound<T>(
  resource: T | null | undefined,
  message = "Resource not found"
): T {
  if (resource === null || resource === undefined) {
    throw new AppError(404, message);
  }
  return resource;
}

export function assertOwnedByUser(
  resourceUserId: string | null | undefined,
  requesterUserId: string,
  message = "Resource not found"
): void {
  if (!resourceUserId || resourceUserId !== requesterUserId) {
    throw new AppError(404, message);
  }
}
