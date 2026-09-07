export interface DatabaseConfig {
  url: string;
  poolMax: number;
  idleTimeoutMs: number;
  connectionTimeoutMs: number;
}

export interface AppConfig {
  env: string;
  port: number;
  isDev: boolean;
  database: DatabaseConfig;
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
}

export interface HttpError extends Error {
  statusCode?: number;
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

export type {
  UserRow,
  CategoryRow,
  SubscriptionRow,
  SubscriptionEventRow,
  DeviceRow,
  RefreshTokenRow,
  NotificationPreferencesRow,
  CurrencyRateRow,
  ParserEventRow,
  AuditLogRow,
} from "./database.js";
