/** Body/query keys that must never be accepted from the client. */
export const UNTRUSTED_IDENTITY_KEYS = [
  "userId",
  "user_id",
  "ownerId",
  "owner_id",
  "accountId",
  "account_id",
] as const;

export function stripUntrustedIdentityFields<T extends Record<string, unknown>>(
  value: T
): T {
  const clone = { ...value };
  for (const key of UNTRUSTED_IDENTITY_KEYS) {
    if (key in clone) {
      delete clone[key];
    }
  }
  return clone;
}
