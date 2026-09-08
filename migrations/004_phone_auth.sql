-- Switch auth identity from email to phone (password auth remains).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE users
  ALTER COLUMN email DROP NOT NULL;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_email_format_chk;

ALTER TABLE users
  ADD CONSTRAINT users_email_format_chk
    CHECK (
      email IS NULL
      OR email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    );

UPDATE users
SET phone = '+1' || substr(replace(id::text, '-', ''), 1, 10)
WHERE phone IS NULL;

ALTER TABLE users
  ALTER COLUMN phone SET NOT NULL;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_phone_format_chk;

ALTER TABLE users
  ADD CONSTRAINT users_phone_format_chk
    CHECK (phone ~ '^\+[1-9][0-9]{7,14}$');

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_uidx
  ON users (phone)
  WHERE deleted_at IS NULL;
