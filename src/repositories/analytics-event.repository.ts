import type { Queryable } from "../db/query.js";
import { query, queryOne } from "../db/query.js";
import type { AnalyticsEventRow } from "../types/database.js";
import type { AnalyticsAction, AnalyticsFunnel } from "../types/index.js";

export type CreateAnalyticsEventInput = {
  sessionId: string;
  userId: string | null;
  anonymousId: string | null;
  deviceKey: string | null;
  funnel: AnalyticsFunnel;
  step: string;
  action: AnalyticsAction;
  properties?: Record<string, unknown>;
};

export type FunnelDateRange = {
  from: Date;
  to: Date;
};

export type SessionMaxStepRow = {
  session_id: string;
  max_ordinal: number;
  last_step: string;
};

export type PaywallCohortRow = {
  viewed: string;
  paid: string;
  dismissed_without_pay: string;
  started_checkout: string;
};

/** Mirrors ONBOARDING_FUNNEL_STEPS ordinals (auth = phone/login). */
const ONBOARDING_STEP_ORDINAL_SQL = `
  CASE step
    WHEN 'welcome' THEN 1
    WHEN 'auth' THEN 2
    WHEN 'verify_code' THEN 3
    WHEN 'notifications' THEN 4
    WHEN 'country' THEN 5
    WHEN 'name' THEN 6
    WHEN 'interests' THEN 7
    WHEN 'profile' THEN 8
    WHEN 'plan' THEN 9
    WHEN 'completed' THEN 10
    ELSE 0
  END
`;

export async function createAnalyticsEvent(
  input: CreateAnalyticsEventInput,
  client?: Queryable
): Promise<AnalyticsEventRow> {
  const row = await queryOne<AnalyticsEventRow>(
    `
      INSERT INTO analytics_events (
        session_id,
        user_id,
        anonymous_id,
        device_key,
        funnel,
        step,
        action,
        properties
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      RETURNING *
    `,
    [
      input.sessionId,
      input.userId,
      input.anonymousId,
      input.deviceKey,
      input.funnel,
      input.step,
      input.action,
      JSON.stringify(input.properties ?? {}),
    ],
    client
  );

  if (!row) {
    throw new Error("Failed to create analytics event");
  }
  return row;
}

export async function listOnboardingSessionMaxSteps(
  range: FunnelDateRange,
  client?: Queryable
): Promise<SessionMaxStepRow[]> {
  return (
    await query<SessionMaxStepRow>(
      `
        SELECT
          session_id,
          MAX(${ONBOARDING_STEP_ORDINAL_SQL})::int AS max_ordinal,
          (
            ARRAY_AGG(
              step
              ORDER BY ${ONBOARDING_STEP_ORDINAL_SQL} DESC, created_at DESC
            )
          )[1] AS last_step
        FROM analytics_events
        WHERE funnel = 'onboarding'
          AND created_at >= $1
          AND created_at < $2
          AND action IN ('viewed', 'completed', 'skipped')
          AND (${ONBOARDING_STEP_ORDINAL_SQL}) > 0
        GROUP BY session_id
      `,
      [range.from, range.to],
      client
    )
  ).rows;
}

export async function getPaywallCohortCounts(
  range: FunnelDateRange,
  client?: Queryable
): Promise<PaywallCohortRow> {
  const row = await queryOne<PaywallCohortRow>(
    `
      WITH paywall_sessions AS (
        SELECT DISTINCT session_id
        FROM analytics_events
        WHERE created_at >= $1
          AND created_at < $2
          AND (
            (funnel = 'paywall' AND action = 'viewed')
            OR (funnel = 'onboarding' AND step = 'plan' AND action = 'viewed')
          )
      ),
      paid_sessions AS (
        SELECT DISTINCT e.session_id
        FROM analytics_events e
        INNER JOIN paywall_sessions p ON p.session_id = e.session_id
        WHERE e.action = 'purchase_completed'
          AND e.created_at >= $1
          AND e.created_at < $2
      ),
      dismissed_sessions AS (
        SELECT DISTINCT e.session_id
        FROM analytics_events e
        INNER JOIN paywall_sessions p ON p.session_id = e.session_id
        WHERE e.action = 'dismissed'
          AND e.created_at >= $1
          AND e.created_at < $2
          AND NOT EXISTS (
            SELECT 1 FROM paid_sessions paid WHERE paid.session_id = e.session_id
          )
      ),
      checkout_sessions AS (
        SELECT DISTINCT e.session_id
        FROM analytics_events e
        INNER JOIN paywall_sessions p ON p.session_id = e.session_id
        WHERE e.action = 'purchase_started'
          AND e.created_at >= $1
          AND e.created_at < $2
      )
      SELECT
        (SELECT COUNT(*)::text FROM paywall_sessions) AS viewed,
        (SELECT COUNT(*)::text FROM paid_sessions) AS paid,
        (SELECT COUNT(*)::text FROM dismissed_sessions) AS dismissed_without_pay,
        (SELECT COUNT(*)::text FROM checkout_sessions) AS started_checkout
    `,
    [range.from, range.to],
    client
  );

  return (
    row ?? {
      viewed: "0",
      paid: "0",
      dismissed_without_pay: "0",
      started_checkout: "0",
    }
  );
}
