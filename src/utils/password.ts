import bcrypt from "bcrypt";
import config from "../config/index.js";

/** bcrypt only uses the first 72 bytes — reject longer passwords explicitly. */
export const PASSWORD_MAX_LENGTH = 72;

export async function hashPassword(password: string): Promise<string> {
  if (password.length > PASSWORD_MAX_LENGTH) {
    throw new Error("Password exceeds bcrypt maximum length");
  }
  return bcrypt.hash(password, config.auth.bcryptCost);
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

/**
 * Precomputed bcrypt hash used to keep login timing similar when the user
 * does not exist (avoids cheap 401 vs expensive bcrypt.compare).
 */
export const TIMING_SAFE_DUMMY_HASH =
  "$2b$10$y5YUO.ix7/bvzavx24reSu1vSleBItRuudIV7MdQHZOaNco6exleO";

