import { query, queryAll } from "../db/query.js";
import { createSubscriptionEvent } from "../repositories/subscription-event.repository.js";
import { revokeExpiredRefreshTokens } from "../repositories/refresh-token.repository.js";
import { listUsersWithPreferenceEnabled } from "../repositories/notification-preferences.repository.js";
import { processNotificationDelivery } from "../services/notification.service.js";
import { refreshCurrencyRates } from "../services/currency.service.js";
import {
  roundMoney,
  toMonthlyAmount,
  toYearlyAmount,
} from "../utils/money.js";
import type { BillingCycle } from "../types/index.js";
import { enqueueNotification } from "./producers.js";
import type { NotificationJobData } from "./constants.js";

type ReminderRow = {
  id: string;
  user_id: string;
  name: string;
  amount: string;
  currency: string;
  billing_cycle: BillingCycle;
  next_billing_date: string | null;
  trial_ends_at: string | null;
  unused_days: number | null;
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function handleTrialReminders(): Promise<{ enqueued: number }> {
  const rows = await queryAll<ReminderRow>(
    `
      SELECT
        s.id,
        s.user_id,
        s.name,
        s.amount,
        s.currency,
        s.billing_cycle,
        s.next_billing_date,
        s.trial_ends_at,
        s.unused_days
      FROM subscriptions s
      LEFT JOIN notification_preferences np ON np.user_id = s.user_id
      WHERE s.status = 'active'
        AND s.is_trial = TRUE
        AND s.trial_ends_at IS NOT NULL
        AND s.trial_ends_at BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '3 days')
        AND COALESCE(np.trials_enabled, TRUE) = TRUE
    `
  );

  let enqueued = 0;
  for (const row of rows) {
    const daysLeft = Math.max(
      0,
      Math.ceil(
        (new Date(row.trial_ends_at!).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24)
      )
    );
    const payload: NotificationJobData = {
      userId: row.user_id,
      subscriptionId: row.id,
      type: "trial",
      title: "Trial ending soon",
      body: `${row.name} trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
      dedupeKey: `trial:${row.id}:${todayKey()}`,
    };
    await enqueueNotification(payload);
    enqueued += 1;
  }

  return { enqueued };
}

export async function handleRenewalReminders(): Promise<{ enqueued: number }> {
  const rows = await queryAll<ReminderRow>(
    `
      SELECT
        s.id,
        s.user_id,
        s.name,
        s.amount,
        s.currency,
        s.billing_cycle,
        s.next_billing_date,
        s.trial_ends_at,
        s.unused_days
      FROM subscriptions s
      LEFT JOIN notification_preferences np ON np.user_id = s.user_id
      WHERE s.status = 'active'
        AND s.next_billing_date IS NOT NULL
        AND s.next_billing_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '2 days')
        AND COALESCE(np.renewals_enabled, TRUE) = TRUE
    `
  );

  let enqueued = 0;
  for (const row of rows) {
    const payload: NotificationJobData = {
      userId: row.user_id,
      subscriptionId: row.id,
      type: "renewal",
      title: "Renewal coming up",
      body: `${row.name} renews soon · ${row.currency} ${row.amount}`,
      dedupeKey: `renewal:${row.id}:${todayKey()}`,
    };
    await enqueueNotification(payload);
    enqueued += 1;
  }

  return { enqueued };
}

export async function handleGhostDetection(): Promise<{
  updated: number;
  enqueued: number;
}> {
  const result = await query(
    `
      UPDATE subscriptions
      SET unused_days = GREATEST(
        0,
        (CURRENT_DATE - COALESCE(last_used_at::date, created_at::date))
      )
      WHERE status = 'active'
      RETURNING id, user_id, name, amount, currency, unused_days
    `
  );

  const ghosts = (result.rows as Array<{
    id: string;
    user_id: string;
    name: string;
    amount: string;
    currency: string;
    unused_days: number | null;
  }>).filter((row) => (row.unused_days ?? 0) >= 30);

  let enqueued = 0;
  for (const row of ghosts) {
    await createSubscriptionEvent({
      subscriptionId: row.id,
      userId: row.user_id,
      eventType: "marked_unused",
      payload: { unusedDays: row.unused_days },
    });

    await enqueueNotification({
      userId: row.user_id,
      subscriptionId: row.id,
      type: "ghost",
      title: "Unused subscription",
      body: `${row.name} looks quiet for ${row.unused_days} days`,
      dedupeKey: `ghost:${row.id}:${todayKey()}`,
    });
    enqueued += 1;
  }

  return { updated: result.rowCount ?? 0, enqueued };
}

export async function handleWeeklySummary(): Promise<{ enqueued: number }> {
  const userIds = await listUsersWithPreferenceEnabled("weekly_summary_enabled");
  let enqueued = 0;

  for (const userId of userIds) {
    const rows = await queryAll<{
      amount: string;
      billing_cycle: BillingCycle;
      currency: string;
    }>(
      `
        SELECT amount, billing_cycle, currency
        FROM subscriptions
        WHERE user_id = $1
          AND status = 'active'
      `,
      [userId]
    );

    if (rows.length === 0) continue;

    const monthly = rows.reduce(
      (sum, row) => sum + toMonthlyAmount(Number(row.amount), row.billing_cycle),
      0
    );
    const currency = rows[0]?.currency ?? "USD";

    await enqueueNotification({
      userId,
      subscriptionId: null,
      type: "weekly_summary",
      title: "Weekly spend summary",
      body: `This week's burn: ${currency} ${roundMoney(monthly)} across ${rows.length} plan${rows.length === 1 ? "" : "s"}`,
      dedupeKey: `weekly_summary:${userId}:${todayKey()}`,
    });
    enqueued += 1;
  }

  return { enqueued };
}

export async function handleUpcomingWeekDigest(): Promise<{ enqueued: number }> {
  const userIds = await listUsersWithPreferenceEnabled("upcoming_week_enabled");
  let enqueued = 0;

  for (const userId of userIds) {
    const rows = await queryAll<{ name: string }>(
      `
        SELECT name
        FROM subscriptions
        WHERE user_id = $1
          AND status = 'active'
          AND next_billing_date IS NOT NULL
          AND next_billing_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '7 days')
        ORDER BY next_billing_date ASC
      `,
      [userId]
    );

    if (rows.length === 0) continue;

    await enqueueNotification({
      userId,
      subscriptionId: null,
      type: "upcoming_week",
      title: "Upcoming this week",
      body:
        rows.length === 1
          ? `${rows[0]!.name} renews within 7 days`
          : `${rows.length} renewals land within 7 days`,
      dedupeKey: `upcoming_week:${userId}:${todayKey()}`,
    });
    enqueued += 1;
  }

  return { enqueued };
}

export async function handleCurrencyRateUpdate(): Promise<{
  base: string;
  count: number;
  source: string;
  fallback: boolean;
  fetchedAt: string;
}> {
  const result = await refreshCurrencyRates();
  console.info(
    `[currency] refreshed base=${result.base} count=${result.count} source=${result.source} fallback=${result.fallback}`
  );
  return result;
}

export async function handleProcessNotification(
  data: NotificationJobData
): Promise<Awaited<ReturnType<typeof processNotificationDelivery>>> {
  const result = await processNotificationDelivery(data);

  if (result.skipReason === "quiet_hours" && result.delayedMs) {
    await enqueueNotification(data, { delayMs: result.delayedMs });
    console.info(
      `[notify:${data.type}] quiet-hours delay=${result.delayedMs}ms user=${data.userId}`
    );
  }

  return result;
}

export async function handleMonthlyCalculations(): Promise<{
  users: number;
  monthlyTotal: number;
}> {
  const rows = await queryAll<{
    user_id: string;
    amount: string;
    billing_cycle: BillingCycle;
  }>(
    `
      SELECT user_id, amount, billing_cycle
      FROM subscriptions
      WHERE status = 'active'
    `
  );

  const byUser = new Map<string, number>();
  let monthlyTotal = 0;

  for (const row of rows) {
    const monthly = toMonthlyAmount(Number(row.amount), row.billing_cycle);
    monthlyTotal += monthly;
    byUser.set(row.user_id, (byUser.get(row.user_id) ?? 0) + monthly);
  }

  console.info(
    `[monthly-calculations] users=${byUser.size} burn=${roundMoney(monthlyTotal)} yearly~=${roundMoney(toYearlyAmount(monthlyTotal, "monthly"))}`
  );

  return {
    users: byUser.size,
    monthlyTotal: roundMoney(monthlyTotal),
  };
}

export async function handleExpiredSessionCleanup(): Promise<{
  revoked: number;
}> {
  const revoked = await revokeExpiredRefreshTokens();
  console.info(`[session-cleanup] revoked=${revoked}`);
  return { revoked };
}
