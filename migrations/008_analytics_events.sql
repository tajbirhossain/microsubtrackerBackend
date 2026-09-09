-- Product analytics: onboarding funnel + paywall conversion events
CREATE TABLE IF NOT EXISTS analytics_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL,
  user_id       UUID REFERENCES users (id) ON DELETE SET NULL,
  anonymous_id  TEXT,
  device_key    TEXT,
  funnel        TEXT NOT NULL,
  step          TEXT NOT NULL,
  action        TEXT NOT NULL,
  properties    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT analytics_events_funnel_chk
    CHECK (funnel IN ('onboarding', 'paywall')),
  CONSTRAINT analytics_events_action_chk
    CHECK (action IN (
      'viewed',
      'completed',
      'skipped',
      'purchase_started',
      'purchase_completed',
      'dismissed'
    )),
  CONSTRAINT analytics_events_actor_chk
    CHECK (user_id IS NOT NULL OR anonymous_id IS NOT NULL)
);

CREATE INDEX analytics_events_funnel_created_idx
  ON analytics_events (funnel, created_at DESC);

CREATE INDEX analytics_events_session_idx
  ON analytics_events (session_id, created_at);

CREATE INDEX analytics_events_step_action_idx
  ON analytics_events (funnel, step, action, created_at DESC);

CREATE INDEX analytics_events_user_idx
  ON analytics_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
