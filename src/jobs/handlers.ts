import { query, queryAll } from "../db/query.js";
import { setCachedCurrencyRates } from "../redis/currency-cache.js";
import { createSubscriptionEvent } from "../repositories/subscription-event.repository.js";
import { revokeExpiredRefreshTokens } from "../repositories/refresh-token.repository.js";
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
      SELECT id, user_id, name, amount, currency, next_billing_date, trial_ends_at, unused_days
      FROM subscriptions
      WHERE status = 'active'
        AND is_trial = TRUE
        AND trial_ends_at IS NOT NULL
        AND trial_ends_at BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '3 days')
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
      SELECT id, user_id, name, amount, currency, next_billing_date, trial_ends_at, unused_days
      FROM subscriptions
      WHERE status = 'active'
        AND next_billing_date IS NOT NULL
        AND next_billing_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '2 days')
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

  const ghosts = (result.rows as ReminderRow[]).filter(
    (row) => (row.unused_days ?? 0) >= 30
  );

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

export async function handleCurrencyRateUpdate(): Promise<{
  base: string;
  count: number;
}> {
  // Placeholder rates until section 11 wires an external API.
  const rates: Record<string, number> = {
    EUR: 0.92,
    GBP: 0.79,
    CAD: 1.36,
    AUD: 1.53,
    INR: 83.2,
    BDT: 109.5,
    JPY: 149.8,
    SGD: 1.34,
    AED: 3.67,
  };

  await setCachedCurrencyRates({
    base: "USD",
    rates,
    fetchedAt: new Date().toISOString(),
    source: "worker-placeholder",
  });

  return { base: "USD", count: Object.keys(rates).length };
}

export async function handleProcessNotification(
  data: NotificationJobData
): Promise<{ delivered: boolean }> {
  // Push delivery lands in section 10; for now we record intent + log.
  console.info(
    `[notify:${data.type}] user=${data.userId} sub=${data.subscriptionId} ${data.title} — ${data.body}`
  );
  return { delivered: true };
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
