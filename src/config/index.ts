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
      otpTtlSeconds: optionalPositiveInt("OTP_TTL_SECONDS", 600),
      otpMaxAttempts: optionalPositiveInt("OTP_MAX_ATTEMPTS", 5),
      bcryptCost: optionalPositiveInt("BCRYPT_COST", isDev ? 10 : 12),
      appPublicUrl: optionalEnv("APP_PUBLIC_URL", "http://localhost:5000"),
    },
    redis: {
      url: requireEnv("REDIS_URL"),
      keyPrefix: optionalEnv("REDIS_KEY_PREFIX", "mst:"),
      rateLimitWindowSeconds: optionalPositiveInt(
        "RATE_LIMIT_WINDOW_SECONDS",
        60
      ),
      rateLimitMax: optionalPositiveInt("RATE_LIMIT_MAX", 120),
      authRateLimitMax: optionalPositiveInt("AUTH_RATE_LIMIT_MAX", 30),
      currencyCacheTtlSeconds: optionalPositiveInt(
        "CURRENCY_CACHE_TTL_SECONDS",
        60 * 60
      ),
      idempotencyTtlSeconds: optionalPositiveInt(
        "IDEMPOTENCY_TTL_SECONDS",
        60 * 60 * 24
      ),
      sessionTtlSeconds: optionalPositiveInt(
        "SESSION_CACHE_TTL_SECONDS",
        60 * 60 * 24 * 30
      ),
    },
    jobs: {
      concurrency: optionalPositiveInt("JOB_CONCURRENCY", 5),
      attempts: optionalPositiveInt("JOB_ATTEMPTS", 5),
      backoffMs: optionalPositiveInt("JOB_BACKOFF_MS", 2000),
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
