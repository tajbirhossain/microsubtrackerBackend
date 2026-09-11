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

function requireSecret(name: string, minLength = 32): string {
  const value = requireEnv(name);
  if (value.length < minLength) {
    throw new Error(`${name} must be at least ${minLength} characters`);
  }
  return value;
}

function parseCorsOrigins(raw: string): string[] {
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function parseDatabaseUrlHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function isSupabaseDatabaseUrl(url: string): boolean {
  const host = parseDatabaseUrlHost(url) ?? url;
  return (
    host.includes("supabase.co") ||
    host.includes("supabase.com") ||
    host.includes("pooler.supabase")
  );
}

function isLocalDatabaseUrl(url: string): boolean {
  const host = parseDatabaseUrlHost(url);
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/**
 * Supabase (and most hosted Postgres) require TLS.
 * LOCALHOST → no SSL unless DATABASE_SSL=true.
 */
function resolveDatabaseSsl(
  url: string
): false | { rejectUnauthorized: boolean } {
  const mode = optionalEnv("DATABASE_SSL", "auto").toLowerCase();
  const rejectUnauthorized =
    optionalEnv("DATABASE_SSL_REJECT_UNAUTHORIZED", "false").toLowerCase() ===
    "true";

  if (mode === "false" || mode === "disable" || mode === "off") {
    return false;
  }

  if (mode === "true" || mode === "require" || mode === "on") {
    return { rejectUnauthorized };
  }

  // auto
  if (isLocalDatabaseUrl(url) && !isSupabaseDatabaseUrl(url)) {
    return false;
  }

  return { rejectUnauthorized };
}

export function loadConfig(): AppConfig {
  const env = process.env.NODE_ENV ?? "development";
  const isDev = env === "development";
  const accessTokenSecret = requireSecret("JWT_ACCESS_SECRET");
  const refreshRaw = process.env.JWT_REFRESH_SECRET?.trim();
  const refreshTokenSecret =
    refreshRaw && refreshRaw.length > 0
      ? refreshRaw.length >= 32
        ? refreshRaw
        : (() => {
            throw new Error("JWT_REFRESH_SECRET must be at least 32 characters");
          })()
      : accessTokenSecret;

  const databaseUrl = requireEnv("DATABASE_URL");
  const directUrl = optionalEnv("DATABASE_DIRECT_URL", "") || null;
  const supabase =
    isSupabaseDatabaseUrl(databaseUrl) ||
    (directUrl ? isSupabaseDatabaseUrl(directUrl) : false);

  // Nano free tier ~15 server-side pool slots. API + worker each open a pool,
  // so keep per-process max small (3 default, hard-capped at 5).
  const requestedPoolMax = optionalPositiveInt(
    "DB_POOL_MAX",
    supabase ? 3 : 10
  );
  const poolMax = supabase ? Math.min(requestedPoolMax, 5) : requestedPoolMax;

  return {
    env,
    port: optionalPositiveInt("PORT", 5000),
    isDev,
    database: {
      url: databaseUrl,
      directUrl,
      poolMax,
      idleTimeoutMs: optionalPositiveInt(
        "DB_IDLE_TIMEOUT_MS",
        supabase ? 10_000 : 30_000
      ),
      connectionTimeoutMs: optionalPositiveInt(
        "DB_CONNECTION_TIMEOUT_MS",
        supabase ? 15_000 : 10_000
      ),
      ssl: resolveDatabaseSsl(databaseUrl),
      isSupabase: supabase,
    },
    auth: {
      accessTokenSecret,
      refreshTokenSecret,
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
    email: (() => {
      const resendApiKey = optionalEnv("RESEND_API_KEY", "") || null;
      const hasResendKey = Boolean(resendApiKey);
      const providerRaw = optionalEnv(
        "EMAIL_PROVIDER",
        hasResendKey ? "resend" : "log"
      ).toLowerCase();

      if (providerRaw !== "resend" && providerRaw !== "log") {
        throw new Error("EMAIL_PROVIDER must be log or resend");
      }

      let provider: "log" | "resend" = providerRaw;

      if (!isDev) {
        if (!hasResendKey) {
          throw new Error(
            "RESEND_API_KEY is required when NODE_ENV=production"
          );
        }
        provider = "resend";
      } else if (provider === "resend" && !hasResendKey) {
        throw new Error("RESEND_API_KEY is required when EMAIL_PROVIDER=resend");
      }

      return {
        provider,
        from: optionalEnv(
          "EMAIL_FROM",
          "Micro Sub Tracker <onboarding@resend.dev>"
        ),
        resendApiKey,
      };
    })(),
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
      // On Render free tier there is no Background Worker — embed by default.
      runInApi:
        optionalEnv(
          "RUN_WORKER_IN_API",
          process.env.RENDER === "true" ? "true" : "false"
        ).toLowerCase() === "true",
    },
    push: {
      expoAccessToken: optionalEnv("EXPO_ACCESS_TOKEN", "") || null,
      forceLog:
        optionalEnv("PUSH_FORCE_LOG", isDev ? "true" : "false").toLowerCase() ===
        "true",
    },
    gemini: {
      apiKey: optionalEnv("GEMINI_API_KEY", "") || null,
      model: optionalEnv("GEMINI_MODEL", "gemini-3.6-flash"),
    },
    security: {
      corsOrigins: parseCorsOrigins(
        optionalEnv("CORS_ORIGINS", isDev ? "*" : "*")
      ),
      trustProxy:
        optionalEnv("TRUST_PROXY", isDev ? "false" : "true").toLowerCase() ===
        "true",
      userRateLimitMax: optionalPositiveInt("USER_RATE_LIMIT_MAX", 180),
      analyticsAdminToken: optionalEnv("ANALYTICS_ADMIN_TOKEN", "") || null,
    },
  };
}

export function toPoolConfig(
  database: AppConfig["database"],
  options?: { forMigrations?: boolean }
): PoolConfig {
  const connectionString =
    options?.forMigrations && database.directUrl
      ? database.directUrl
      : database.url;

  const ssl = resolveDatabaseSsl(connectionString);

  // Migrations only need a single connection.
  const max = options?.forMigrations
    ? 1
    : database.isSupabase
      ? Math.min(database.poolMax, 5)
      : database.poolMax;

  return {
    connectionString,
    max,
    idleTimeoutMillis: database.idleTimeoutMs,
    connectionTimeoutMillis: database.connectionTimeoutMs,
    allowExitOnIdle: database.isSupabase || Boolean(options?.forMigrations),
    ...(database.isSupabase ? { maxUses: 5_000 } : {}),
    ...(ssl ? { ssl } : {}),
  };
}

const config = loadConfig();

export default config;
