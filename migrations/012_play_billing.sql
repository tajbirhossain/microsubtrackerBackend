-- Switch entitlements storage from Paddle to Google Play Billing

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_product_id TEXT,
  ADD COLUMN IF NOT EXISTS google_purchase_token TEXT,
  ADD COLUMN IF NOT EXISTS google_order_id TEXT;

ALTER TABLE users
  DROP COLUMN IF EXISTS paddle_customer_id,
  DROP COLUMN IF EXISTS paddle_subscription_id;

DROP INDEX IF EXISTS users_paddle_customer_id_idx;
DROP INDEX IF EXISTS users_paddle_subscription_id_idx;

CREATE UNIQUE INDEX IF NOT EXISTS users_google_purchase_token_uidx
  ON users (google_purchase_token)
  WHERE google_purchase_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_google_order_id_idx
  ON users (google_order_id)
  WHERE google_order_id IS NOT NULL;
