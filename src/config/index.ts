import dotenv from "dotenv";
import type { PoolConfig } from "pg";
import type { AppConfig } from "../types/index.js";

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function optionalPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function loadConfig(): AppConfig {
  const env = process.env.NODE_ENV ?? "development";
  const isDev = env === "development";
  const accessTokenSecret = requireEnv("JWT_ACCESS_SECRET");

  return {
    env,
    port: optionalPositiveInt("PORT", 5000),
    isDev,
    database: {
      url: requireEnv("DATABASE_URL"),
      poolMax: optionalPositiveInt("DB_POOL_MAX", 10),
      idleTimeoutMs: optionalPositiveInt("DB_IDLE_TIMEOUT_MS", 30_000),
      connectionTimeoutMs: optionalPositiveInt("DB_CONNECTION_TIMEOUT_MS", 5_000),
    },
    auth: {
      accessTokenSecret,
      refreshTokenSecret: optionalEnv("JWT_REFRESH_SECRET", accessTokenSecret),
      accessTokenTtlSeconds: optionalPositiveInt("ACCESS_TOKEN_TTL_SECONDS", 900),
      refreshTokenTtlSeconds: optionalPositiveInt(
        "REFRESH_TOKEN_TTL_SECONDS",
        60 * 60 * 24 * 30
      ),
      emailVerificationTtlSeconds: optionalPositiveInt(
        "EMAIL_VERIFICATION_TTL_SECONDS",
        60 * 60 * 24
      ),
      passwordResetTtlSeconds: optionalPositiveInt(
        "PASSWORD_RESET_TTL_SECONDS",
        60 * 60
      ),
      bcryptCost: optionalPositiveInt("BCRYPT_COST", isDev ? 10 : 12),
      appPublicUrl: optionalEnv("APP_PUBLIC_URL", "http://localhost:5000"),
    },
  };
}

export function toPoolConfig(database: AppConfig["database"]): PoolConfig {
  return {
    connectionString: database.url,
    max: database.poolMax,
    idleTimeoutMillis: database.idleTimeoutMs,
    connectionTimeoutMillis: database.connectionTimeoutMs,
  };
}

const config = loadConfig();

export default config;
