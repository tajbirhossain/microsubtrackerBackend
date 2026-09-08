import { createHash, randomBytes } from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import config from "../config/index.js";
import type { AccessTokenPayload } from "../types/index.js";
import { AppError } from "./errors.js";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateOpaqueToken(bytes = 48): string {
  return randomBytes(bytes).toString("base64url");
}

export function signAccessToken(payload: Omit<AccessTokenPayload, "typ">): string {
  const options: SignOptions = {
    expiresIn: config.auth.accessTokenTtlSeconds,
  };

  return jwt.sign(
    { ...payload, typ: "access" satisfies AccessTokenPayload["typ"] },
    config.auth.accessTokenSecret,
    options
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, config.auth.accessTokenSecret);

    if (
      typeof decoded !== "object" ||
      decoded === null ||
      decoded.typ !== "access" ||
      typeof decoded.sub !== "string" ||
      typeof decoded.email !== "string"
    ) {
      throw new AppError(401, "Invalid access token");
    }

    return {
      sub: decoded.sub,
      email: decoded.email,
      typ: "access",
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(401, "Invalid or expired access token");
  }
}

export function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}
