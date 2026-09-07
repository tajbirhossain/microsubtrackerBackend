-- MicroSubTracker initial schema
-- Tables: users, categories, subscriptions, subscription_events,
--         devices, refresh_tokens, notification_preferences,
--         currency_rates, parser_events, audit_logs

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  display_name    TEXT,
  preferred_currency CHAR(3) NOT NULL DEFAULT 'USD',
  email_verified_at TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_format_chk
    CHECK (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CONSTRAINT users_preferred_currency_chk
    CHECK (preferred_currency ~ '^[A-Z]{3}$')
);

CREATE UNIQUE INDEX users_email_lower_uidx ON users (LOWER(email));
CREATE INDEX users_deleted_at_idx ON users (deleted_at) WHERE deleted_at IS NULL;

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ---------------------------------------------------------------------------
-- categories (system seeds + optional per-user custom)
-- ---------------------------------------------------------------------------
CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL,
  name        TEXT NOT NULL,
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  user_id     UUID REFERENCES users (id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT categories_slug_format_chk
    CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT categories_system_ownership_chk
    CHECK (
      (is_system = TRUE AND user_id IS NULL)
      OR (is_system = FALSE AND user_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX categories_system_slug_uidx
  ON categories (slug)
  WHERE is_system = TRUE;

CREATE UNIQUE INDEX categories_user_slug_uidx
  ON categories (user_id, slug)
  WHERE user_id IS NOT NULL;

CREATE INDEX categories_user_id_idx ON categories (user_id);

-- ---------------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------------
CREATE TABLE subscriptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  category_id       UUID REFERENCES categories (id) ON DELETE SET NULL,
  name              TEXT NOT NULL,
  amount            NUMERIC(12, 2) NOT NULL,
  currency          CHAR(3) NOT NULL DEFAULT 'USD',
  billing_cycle     TEXT NOT NULL,
  scale             TEXT NOT NULL DEFAULT 'micro',
  status            TEXT NOT NULL DEFAULT 'active',
  next_billing_date DATE,
  is_trial          BOOLEAN NOT NULL DEFAULT FALSE,
  trial_ends_at     DATE,
  last_used_at      TIMESTAMPTZ,
  unused_days       INTEGER,
  provider_key      TEXT,
  color             TEXT,
  icon              TEXT,
  cancelled_at      TIMESTAMPTZ,
  cancellation_notes TEXT,
  version           INTEGER NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT subscriptions_name_len_chk
    CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  CONSTRAINT subscriptions_amount_chk
    CHECK (amount >= 0),
  CONSTRAINT subscriptions_currency_chk
    CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT subscriptions_billing_cycle_chk
    CHECK (billing_cycle IN ('weekly', 'monthly', 'yearly')),
  CONSTRAINT subscriptions_scale_chk
    CHECK (scale IN ('micro', 'macro')),
  CONSTRAINT subscriptions_status_chk
    CHECK (status IN ('active', 'cancelled', 'paused')),
  CONSTRAINT subscriptions_unused_days_chk
    CHECK (unused_days IS NULL OR unused_days >= 0),
  CONSTRAINT subscriptions_version_chk
    CHECK (version >= 1),
  CONSTRAINT subscriptions_trial_consistency_chk
    CHECK (
      (is_trial = FALSE AND trial_ends_at IS NULL)
      OR (is_trial = TRUE)
    ),
  CONSTRAINT subscriptions_cancelled_consistency_chk
    CHECK (
      (status <> 'cancelled' AND cancelled_at IS NULL)
      OR (status = 'cancelled')
    )
);

CREATE INDEX subscriptions_user_id_idx ON subscriptions (user_id);
CREATE INDEX subscriptions_user_status_idx ON subscriptions (user_id, status);
CREATE INDEX subscriptions_user_next_billing_idx
  ON subscriptions (user_id, next_billing_date)
  WHERE status = 'active';
CREATE INDEX subscriptions_user_trial_idx
  ON subscriptions (user_id, trial_ends_at)
  WHERE is_trial = TRUE AND status = 'active';
CREATE INDEX subscriptions_category_id_idx ON subscriptions (category_id);
CREATE INDEX subscriptions_provider_key_idx
  ON subscriptions (user_id, provider_key)
  WHERE provider_key IS NOT NULL;

CREATE TRIGGER subscriptions_set_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ---------------------------------------------------------------------------
-- subscription_events
-- ---------------------------------------------------------------------------
CREATE TABLE subscription_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id  UUID NOT NULL REFERENCES subscriptions (id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  event_type       TEXT NOT NULL,
  payload          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT subscription_events_type_chk
    CHECK (event_type IN (
      'created',
      'updated',
      'cancelled',
      'reactivated',
      'renewed',
      'trial_started',
      'trial_ended',
      'marked_unused',
      'usage_recorded',
      'category_changed'
    ))
);

CREATE INDEX subscription_events_subscription_idx
  ON subscription_events (subscription_id, created_at DESC);
CREATE INDEX subscription_events_user_idx
  ON subscription_events (user_id, created_at DESC);
CREATE INDEX subscription_events_type_idx
  ON subscription_events (event_type);

-- ---------------------------------------------------------------------------
-- devices
-- ---------------------------------------------------------------------------
CREATE TABLE devices (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  device_key   TEXT NOT NULL,
  platform     TEXT NOT NULL,
  push_token   TEXT,
  app_version  TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT devices_platform_chk
    CHECK (platform IN ('android', 'ios', 'web')),
  CONSTRAINT devices_device_key_len_chk
    CHECK (char_length(trim(device_key)) BETWEEN 1 AND 255),
  CONSTRAINT devices_user_device_key_uidx UNIQUE (user_id, device_key)
);

CREATE INDEX devices_user_id_idx ON devices (user_id);
CREATE INDEX devices_push_token_idx ON devices (push_token) WHERE push_token IS NOT NULL;

CREATE TRIGGER devices_set_updated_at
  BEFORE UPDATE ON devices
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ---------------------------------------------------------------------------
-- refresh_tokens
-- ---------------------------------------------------------------------------
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  device_id   UUID REFERENCES devices (id) ON DELETE SET NULL,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT refresh_tokens_token_hash_uidx UNIQUE (token_hash),
  CONSTRAINT refresh_tokens_expiry_chk
    CHECK (expires_at > created_at)
);

CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_active_idx
  ON refresh_tokens (user_id, expires_at)
  WHERE revoked_at IS NULL;
CREATE INDEX refresh_tokens_expires_at_idx ON refresh_tokens (expires_at);

-- ---------------------------------------------------------------------------
-- notification_preferences
-- ---------------------------------------------------------------------------
CREATE TABLE notification_preferences (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  renewals_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  trials_enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  unused_enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  weekly_summary_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  upcoming_week_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  quiet_hours_start       TIME,
  quiet_hours_end         TIME,
  timezone                TEXT NOT NULL DEFAULT 'UTC',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_preferences_user_uidx UNIQUE (user_id),
  CONSTRAINT notification_preferences_quiet_hours_chk
    CHECK (
      (quiet_hours_start IS NULL AND quiet_hours_end IS NULL)
      OR (quiet_hours_start IS NOT NULL AND quiet_hours_end IS NOT NULL)
    )
);

CREATE TRIGGER notification_preferences_set_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ---------------------------------------------------------------------------
-- currency_rates
-- ---------------------------------------------------------------------------
CREATE TABLE currency_rates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency   CHAR(3) NOT NULL DEFAULT 'USD',
  quote_currency  CHAR(3) NOT NULL,
  rate            NUMERIC(18, 8) NOT NULL,
  source          TEXT,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT currency_rates_base_chk
    CHECK (base_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT currency_rates_quote_chk
    CHECK (quote_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT currency_rates_pair_chk
    CHECK (base_currency <> quote_currency),
  CONSTRAINT currency_rates_rate_chk
    CHECK (rate > 0),
  CONSTRAINT currency_rates_pair_uidx UNIQUE (base_currency, quote_currency)
);

CREATE INDEX currency_rates_fetched_at_idx ON currency_rates (fetched_at DESC);

-- ---------------------------------------------------------------------------
-- parser_events (SMS / notification ingestion pipeline)
-- ---------------------------------------------------------------------------
CREATE TABLE parser_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  device_id         UUID REFERENCES devices (id) ON DELETE SET NULL,
  subscription_id   UUID REFERENCES subscriptions (id) ON DELETE SET NULL,
  source_type       TEXT NOT NULL,
  raw_payload       TEXT NOT NULL,
  normalized_payload JSONB,
  merchant          TEXT,
  amount            NUMERIC(12, 2),
  currency          CHAR(3),
  confidence        NUMERIC(4, 3),
  status            TEXT NOT NULL DEFAULT 'pending',
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT parser_events_source_type_chk
    CHECK (source_type IN ('sms', 'notification')),
  CONSTRAINT parser_events_status_chk
    CHECK (status IN ('pending', 'classified', 'confirmed', 'rejected', 'failed')),
  CONSTRAINT parser_events_amount_chk
    CHECK (amount IS NULL OR amount >= 0),
  CONSTRAINT parser_events_currency_chk
    CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  CONSTRAINT parser_events_confidence_chk
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);

CREATE INDEX parser_events_user_status_idx ON parser_events (user_id, status);
CREATE INDEX parser_events_user_created_idx ON parser_events (user_id, created_at DESC);
CREATE INDEX parser_events_subscription_idx
  ON parser_events (subscription_id)
  WHERE subscription_id IS NOT NULL;

CREATE TRIGGER parser_events_set_updated_at
  BEFORE UPDATE ON parser_events
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES users (id) ON DELETE SET NULL,
  actor_type     TEXT NOT NULL DEFAULT 'user',
  action         TEXT NOT NULL,
  resource_type  TEXT,
  resource_id    UUID,
  ip_address     INET,
  user_agent     TEXT,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_logs_actor_type_chk
    CHECK (actor_type IN ('user', 'system', 'worker')),
  CONSTRAINT audit_logs_action_len_chk
    CHECK (char_length(trim(action)) BETWEEN 1 AND 120)
);

CREATE INDEX audit_logs_user_created_idx ON audit_logs (user_id, created_at DESC);
CREATE INDEX audit_logs_resource_idx ON audit_logs (resource_type, resource_id);
CREATE INDEX audit_logs_created_at_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_action_idx ON audit_logs (action);
