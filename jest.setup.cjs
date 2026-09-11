process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgres://localhost:5432/microsubtracker_test";
process.env.REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
process.env.REDIS_KEY_PREFIX = process.env.REDIS_KEY_PREFIX || "mst:";
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ||
  "test-jwt-access-secret-32chars-min!!";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ||
  "test-jwt-refresh-secret-32chars-min!";
process.env.EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || "log";
process.env.IDEMPOTENCY_TTL_SECONDS =
  process.env.IDEMPOTENCY_TTL_SECONDS || "86400";
process.env.LOG_LEVEL = process.env.LOG_LEVEL || "silent";
process.env.GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "test-gemini-key-for-unit-tests";
process.env.GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
