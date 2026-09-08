-- Auth follow-ups: allow re-register after soft delete; verification + reset tokens.

DROP INDEX IF EXISTS users_email_lower_uidx;

CREATE UNIQUE INDEX users_email_lower_uidx
  ON users (LOWER(email))
  WHERE deleted_at IS NULL;

CREATE TABLE email_verification_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT email_verification_tokens_hash_uidx UNIQUE (token_hash),
  CONSTRAINT email_verification_tokens_expiry_chk CHECK (expires_at > created_at)
);

CREATE INDEX email_verification_tokens_user_idx
  ON email_verification_tokens (user_id, created_at DESC);

CREATE TABLE password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT password_reset_tokens_hash_uidx UNIQUE (token_hash),
  CONSTRAINT password_reset_tokens_expiry_chk CHECK (expires_at > created_at)
);

CREATE INDEX password_reset_tokens_user_idx
  ON password_reset_tokens (user_id, created_at DESC);
