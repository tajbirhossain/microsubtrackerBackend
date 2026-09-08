-- OTP challenges for registration, new-device login, and password reset.
-- Known-device logins do not require OTP.

CREATE TABLE otp_challenges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         TEXT NOT NULL,
  purpose       TEXT NOT NULL,
  code_hash     TEXT NOT NULL,
  user_id       UUID REFERENCES users (id) ON DELETE CASCADE,
  device_key    TEXT,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts  INTEGER NOT NULL DEFAULT 5,
  expires_at    TIMESTAMPTZ NOT NULL,
  consumed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT otp_challenges_purpose_chk
    CHECK (purpose IN ('registration', 'new_device', 'password_reset')),
  CONSTRAINT otp_challenges_phone_format_chk
    CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
  CONSTRAINT otp_challenges_expiry_chk
    CHECK (expires_at > created_at),
  CONSTRAINT otp_challenges_attempts_chk
    CHECK (attempt_count >= 0 AND max_attempts > 0),
  CONSTRAINT otp_challenges_registration_chk
    CHECK (
      (purpose = 'registration' AND user_id IS NULL)
      OR (purpose IN ('new_device', 'password_reset') AND user_id IS NOT NULL)
    )
);

CREATE INDEX otp_challenges_lookup_idx
  ON otp_challenges (phone, purpose, created_at DESC);

CREATE INDEX otp_challenges_active_idx
  ON otp_challenges (phone, purpose)
  WHERE consumed_at IS NULL;
