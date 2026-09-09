export interface DatabaseConfig {
  url: string;
  /** Prefer session/direct connection for migrations (Supabase Direct URL). */
  directUrl: string | null;
  poolMax: number;
  idleTimeoutMs: number;
  connectionTimeoutMs: number;
  ssl: false | { rejectUnauthorized: boolean };
  isSupabase: boolean;
}

export interface AuthConfig {
  accessTokenSecret: string;
  refreshTokenSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  otpTtlSeconds: number;
  otpMaxAttempts: number;
  bcryptCost: number;
  appPublicUrl: string;
}

export interface RedisConfig {
  url: string;
  keyPrefix: string;
  rateLimitWindowSeconds: number;
  rateLimitMax: number;
  authRateLimitMax: number;
  currencyCacheTtlSeconds: number;
  idempotencyTtlSeconds: number;
  sessionTtlSeconds: number;
}

export interface JobsConfig {
  concurrency: number;
  attempts: number;
  backoffMs: number;
}

export interface PushConfig {
  expoAccessToken: string | null;
  forceLog: boolean;
}

export interface SecurityConfig {
  corsOrigins: string[];
  trustProxy: boolean;
  userRateLimitMax: number;
  analyticsAdminToken: string | null;
}

export interface AppConfig {
  env: string;
  port: number;
  isDev: boolean;
  database: DatabaseConfig;
  auth: AuthConfig;
  redis: RedisConfig;
  jobs: JobsConfig;
  push: PushConfig;
  security: SecurityConfig;
}

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  message?: string;
  data?: T;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  stack?: string;
  details?: unknown;
}

export interface HttpError extends Error {
  statusCode?: number;
  details?: unknown;
}

export type BillingCycle = "weekly" | "monthly" | "yearly";
export type SpendScale = "micro" | "macro";
export type SubscriptionStatus = "active" | "cancelled" | "paused";
export type DevicePlatform = "android" | "ios" | "web";
export type ParserSourceType = "sms" | "notification";
export type ParserEventStatus =
  | "pending"
  | "classified"
  | "confirmed"
  | "rejected"
  | "failed";
export type AuditActorType = "user" | "system" | "worker";
export type NotificationType =
  | "trial"
  | "renewal"
  | "ghost"
  | "weekly_summary"
  | "upcoming_week";
export type NotificationDeliveryStatus =
  | "sent"
  | "partial"
  | "failed"
  | "skipped";

export type SubscriptionEventType =
  | "created"
  | "updated"
  | "cancelled"
  | "reactivated"
  | "renewed"
  | "trial_started"
  | "trial_ended"
  | "marked_unused"
  | "usage_recorded"
  | "category_changed";

export type AnalyticsFunnel = "onboarding" | "paywall";

export type AnalyticsAction =
  | "viewed"
  | "completed"
  | "skipped"
  | "purchase_started"
  | "purchase_completed"
  | "dismissed";

/** Ordered signup path — used for drop-off aggregation. */
export const ONBOARDING_FUNNEL_STEPS = [
  "welcome",
  "auth",
  "verify_code",
  "notifications",
  "country",
  "name",
  "interests",
  "profile",
  "plan",
  "completed",
] as const;

export type OnboardingFunnelStep = (typeof ONBOARDING_FUNNEL_STEPS)[number];

/** Client may send phone/login; both normalize to auth. */
export const ONBOARDING_STEP_ALIASES: Record<string, OnboardingFunnelStep> = {
  phone: "auth",
  login: "auth",
};

export interface PaginationQuery {
  page?: string | number;
  limit?: string | number;
}

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface AuthUser {
  id: string;
  phone: string;
  displayName: string | null;
  preferredCurrency: string;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  tokenType: "Bearer";
}

export interface AccessTokenPayload {
  sub: string;
  typ: "access";
  phone: string;
}

export type OtpPurpose = "registration" | "new_device" | "password_reset";

export type {
  UserRow,
  CategoryRow,
  SubscriptionRow,
  SubscriptionEventRow,
  DeviceRow,
  RefreshTokenRow,
  NotificationPreferencesRow,
  NotificationDeliveryRow,
  CurrencyRateRow,
  ParserEventRow,
  AuditLogRow,
  EmailVerificationTokenRow,
  PasswordResetTokenRow,
  OtpChallengeRow,
  AnalyticsEventRow,
} from "./database.js";
