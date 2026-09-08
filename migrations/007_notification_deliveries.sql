-- Notification delivery ledger (push attempts + outcomes)
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  subscription_id  UUID REFERENCES subscriptions (id) ON DELETE SET NULL,
  type             TEXT NOT NULL,
  title            TEXT NOT NULL,
  body             TEXT NOT NULL,
  dedupe_key       TEXT NOT NULL,
  status           TEXT NOT NULL,
  skip_reason      TEXT,
  provider         TEXT,
  results          JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  CONSTRAINT notification_deliveries_type_chk
    CHECK (type IN ('trial', 'renewal', 'ghost', 'weekly_summary', 'upcoming_week')),
  CONSTRAINT notification_deliveries_status_chk
    CHECK (status IN ('sent', 'partial', 'failed', 'skipped')),
  CONSTRAINT notification_deliveries_dedupe_uidx UNIQUE (dedupe_key)
);

CREATE INDEX notification_deliveries_user_idx
  ON notification_deliveries (user_id, created_at DESC);

CREATE INDEX notification_deliveries_type_idx
  ON notification_deliveries (type, created_at DESC);

CREATE INDEX notification_deliveries_subscription_idx
  ON notification_deliveries (subscription_id)
  WHERE subscription_id IS NOT NULL;
