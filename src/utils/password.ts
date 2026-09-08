import bcrypt from "bcrypt";
import config from "../config/index.js";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config.auth.bcryptCost);
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}
