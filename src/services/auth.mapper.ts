import type { UserRow } from "../types/database.js";
import type { AuthUser } from "../types/index.js";

export function toAuthUser(user: UserRow): AuthUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    preferredCurrency: user.preferred_currency,
    emailVerified: user.email_verified_at !== null,
    createdAt: user.created_at.toISOString(),
  };
}
