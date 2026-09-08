import type {
  AuditActorType,
  BillingCycle,
  DevicePlatform,
  OtpPurpose,
  ParserEventStatus,
  ParserSourceType,
  SpendScale,
  SubscriptionEventType,
  SubscriptionStatus,
} from "./index.js";

export interface UserRow {
  id: string;
  phone: string;
  email: string | null;
  password_hash: string;
  display_name: string | null;
  preferred_currency: string;
  email_verified_at: Date | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  is_system: boolean;
  user_id: string | null;
  created_at: Date;
}

export interface SubscriptionRow {
  id: string;
  user_id: string;
  category_id: string | null;
  name: string;
  amount: string;
  currency: string;
  billing_cycle: BillingCycle;
  scale: SpendScale;
  status: SubscriptionStatus;
  next_billing_date: string | null;
  is_trial: boolean;
  trial_ends_at: string | null;
  last_used_at: Date | null;
  unused_days: number | null;
  provider_key: string | null;
  color: string | null;
  icon: string | null;
  cancelled_at: Date | null;
  cancellation_notes: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export interface SubscriptionEventRow {
  id: string;
  subscription_id: string;
  user_id: string;
  event_type: SubscriptionEventType;
  payload: Record<string, unknown>;
  created_at: Date;
}

export interface DeviceRow {
  id: string;
  user_id: string;
  device_key: string;
  platform: DevicePlatform;
  push_token: string | null;
  app_version: string | null;
  last_seen_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  device_id: string | null;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}

export interface NotificationPreferencesRow {
  id: string;
  user_id: string;
  renewals_enabled: boolean;
  trials_enabled: boolean;
  unused_enabled: boolean;
  weekly_summary_enabled: boolean;
  upcoming_week_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string;
  created_at: Date;
  updated_at: Date;
}

export interface CurrencyRateRow {
  id: string;
  base_currency: string;
  quote_currency: string;
  rate: string;
  source: string | null;
  fetched_at: Date;
  created_at: Date;
}

export interface ParserEventRow {
  id: string;
  user_id: string;
  device_id: string | null;
  subscription_id: string | null;
  source_type: ParserSourceType;
  raw_payload: string;
  normalized_payload: Record<string, unknown> | null;
  merchant: string | null;
  amount: string | null;
  currency: string | null;
  confidence: string | null;
  status: ParserEventStatus;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  actor_type: AuditActorType;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface EmailVerificationTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

export interface PasswordResetTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

export interface OtpChallengeRow {
  id: string;
  phone: string;
  purpose: OtpPurpose;
  code_hash: string;
  user_id: string | null;
  device_key: string | null;
  payload: Record<string, unknown>;
  attempt_count: number;
  max_attempts: number;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
}
