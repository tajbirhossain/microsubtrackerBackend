-- Switch auth identity from phone back to email (OTP delivered by email).

-- Ephemeral OTP rows; safe to clear before reshaping the column.
DELETE FROM otp_challenges;

UPDATE users
SET email = lower('migrated+' || replace(id::text, '-', '') || '@users.local')
WHERE email IS NULL OR btrim(email) = '';

ALTER TABLE users
  ALTER COLUMN email SET NOT NULL;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_email_format_chk;

ALTER TABLE users
  ADD CONSTRAINT users_email_format_chk
    CHECK (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uidx
  ON users (LOWER(email))
  WHERE deleted_at IS NULL;

ALTER TABLE users
  ALTER COLUMN phone DROP NOT NULL;

DROP INDEX IF EXISTS users_phone_uidx;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_phone_format_chk;

ALTER TABLE users
  ADD CONSTRAINT users_phone_format_chk
    CHECK (
      phone IS NULL
      OR phone ~ '^\+[1-9][0-9]{7,14}$'
    );

ALTER TABLE otp_challenges
  RENAME COLUMN phone TO email;

ALTER TABLE otp_challenges
  DROP CONSTRAINT IF EXISTS otp_challenges_phone_format_chk;

ALTER TABLE otp_challenges
  ADD CONSTRAINT otp_challenges_email_format_chk
    CHECK (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

DROP INDEX IF EXISTS otp_challenges_lookup_idx;
DROP INDEX IF EXISTS otp_challenges_active_idx;

CREATE INDEX otp_challenges_lookup_idx
  ON otp_challenges (LOWER(email), purpose, created_at DESC);

CREATE INDEX otp_challenges_active_idx
  ON otp_challenges (LOWER(email), purpose)
  WHERE consumed_at IS NULL;
