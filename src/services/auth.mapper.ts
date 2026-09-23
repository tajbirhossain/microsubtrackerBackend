import type { UserRow } from "../types/database.js";
import type { AuthUser } from "../types/index.js";

export function toAuthUser(user: UserRow): AuthUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    preferredCurrency: user.preferred_currency,
    planTier: user.plan_tier ?? null,
    planStatus: user.plan_status ?? "none",
    createdAt: user.created_at.toISOString(),
  };
}
