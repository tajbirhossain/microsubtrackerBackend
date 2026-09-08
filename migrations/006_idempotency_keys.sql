-- Idempotency records for safe client retries (Postgres until Redis in section 6).

CREATE TABLE idempotency_keys (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  key              TEXT NOT NULL,
  method           TEXT NOT NULL,
  path             TEXT NOT NULL,
  request_hash     TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'processing',
  response_status  INTEGER,
  response_body    JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ NOT NULL,
  CONSTRAINT idempotency_keys_user_key_uidx UNIQUE (user_id, key),
  CONSTRAINT idempotency_keys_status_chk
    CHECK (status IN ('processing', 'completed', 'failed')),
  CONSTRAINT idempotency_keys_key_len_chk
    CHECK (char_length(trim(key)) BETWEEN 8 AND 128),
  CONSTRAINT idempotency_keys_expiry_chk
    CHECK (expires_at > created_at),
  CONSTRAINT idempotency_keys_completed_response_chk
    CHECK (
      (status = 'completed' AND response_status IS NOT NULL AND response_body IS NOT NULL)
      OR (status <> 'completed')
    )
);

CREATE INDEX idempotency_keys_expires_at_idx ON idempotency_keys (expires_at);
CREATE INDEX idempotency_keys_user_created_idx ON idempotency_keys (user_id, created_at DESC);

CREATE TRIGGER idempotency_keys_set_updated_at
  BEFORE UPDATE ON idempotency_keys
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
