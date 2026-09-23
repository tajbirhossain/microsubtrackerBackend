-- App subscription entitlements (Paddle Billing Plus / Pro)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS plan_tier TEXT,
  ADD COLUMN IF NOT EXISTS plan_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS paddle_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS paddle_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS plan_updated_at TIMESTAMPTZ;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_plan_tier_chk;

ALTER TABLE users
  ADD CONSTRAINT users_plan_tier_chk
  CHECK (plan_tier IS NULL OR plan_tier IN ('plus', 'pro'));

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_plan_status_chk;

ALTER TABLE users
  ADD CONSTRAINT users_plan_status_chk
  CHECK (plan_status IN ('none', 'active', 'past_due', 'canceled'));

CREATE INDEX IF NOT EXISTS users_paddle_customer_id_idx
  ON users (paddle_customer_id)
  WHERE paddle_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_paddle_subscription_id_idx
  ON users (paddle_subscription_id)
  WHERE paddle_subscription_id IS NOT NULL;
