import config from "../config/index.js";
import {
  msUntilQuietHoursEnd,
  sendPushMessages,
} from "../notifications/index.js";
import {
  createNotificationDelivery,
  findDeliveryByDedupeKey,
  listDeliveriesForUser,
  type DevicePushResult,
} from "../repositories/notification-delivery.repository.js";
import {
  getOrCreatePreferencesForUser,
  updatePreferencesForUser,
} from "../repositories/notification-preferences.repository.js";
import {
  listDevicesWithPushToken,
  updatePushTokenForDevice,
} from "../repositories/device.repository.js";
import type { NotificationJobData } from "../jobs/constants.js";
import type {
  ListDeliveriesQuery,
  TestNotificationInput,
  UpdatePreferencesInput,
  UpdatePushTokenInput,
} from "../schemas/notification.schemas.js";
import type { NotificationPreferencesRow } from "../types/database.js";
import type { NotificationType } from "../types/index.js";
import { AppError } from "../utils/errors.js";
import {
  toPreferencesUpdateInput,
  toPreferencesView,
  type NotificationPreferencesView,
} from "./notification.mapper.js";

function preferenceEnabledForType(
  prefs: NotificationPreferencesRow,
  type: NotificationType
): boolean {
  switch (type) {
    case "trial":
      return prefs.trials_enabled;
    case "renewal":
      return prefs.renewals_enabled;
    case "ghost":
      return prefs.unused_enabled;
    case "weekly_summary":
      return prefs.weekly_summary_enabled;
    case "upcoming_week":
      return prefs.upcoming_week_enabled;
    default:
      return false;
  }
}

function tokenPreview(token: string): string {
  if (token.length <= 18) return token;
  return `${token.slice(0, 14)}…${token.slice(-4)}`;
}

export async function getPreferences(
  userId: string
): Promise<NotificationPreferencesView> {
  const row = await getOrCreatePreferencesForUser(userId);
  return toPreferencesView(row);
}

export async function updatePreferences(
  userId: string,
  input: UpdatePreferencesInput
): Promise<NotificationPreferencesView> {
  const row = await updatePreferencesForUser(
    userId,
    toPreferencesUpdateInput(input)
  );
  return toPreferencesView(row);
}

export async function registerPushToken(
  userId: string,
  input: UpdatePushTokenInput
): Promise<{ deviceKey: string; pushTokenRegistered: boolean }> {
  const device = await updatePushTokenForDevice(
    userId,
    input.deviceKey,
    input.pushToken
  );

  if (!device) {
    throw new AppError(
      404,
      "Device not found — register/login with this deviceKey first"
    );
  }

  return {
    deviceKey: device.device_key,
    pushTokenRegistered: Boolean(device.push_token),
  };
}

export async function listNotificationHistory(
  userId: string,
  query: ListDeliveriesQuery
) {
  const rows = await listDeliveriesForUser(userId, query.limit);
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    status: row.status,
    skipReason: row.skip_reason,
    provider: row.provider,
    subscriptionId: row.subscription_id,
    dedupeKey: row.dedupe_key,
    results: row.results,
    createdAt: row.created_at.toISOString(),
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
  }));
}

export type ProcessNotificationResult = {
  delivered: boolean;
  status: "sent" | "partial" | "failed" | "skipped";
  skipReason?: string;
  deviceCount: number;
  delayedMs?: number;
};

/**
 * Full delivery path for a notification job:
 * prefs → quiet hours → devices → push provider → delivery ledger
 */
export async function processNotificationDelivery(
  data: NotificationJobData
): Promise<ProcessNotificationResult> {
  const existing = await findDeliveryByDedupeKey(data.dedupeKey);
  if (existing && existing.status !== "skipped") {
    return {
      delivered: existing.status === "sent" || existing.status === "partial",
      status: existing.status,
      skipReason: existing.skip_reason ?? "already_delivered",
      deviceCount: Array.isArray(existing.results)
        ? existing.results.length
        : 0,
    };
  }

  const prefs = await getOrCreatePreferencesForUser(data.userId);

  if (!preferenceEnabledForType(prefs, data.type)) {
    await createNotificationDelivery({
      userId: data.userId,
      subscriptionId: data.subscriptionId,
      type: data.type,
      title: data.title,
      body: data.body,
      dedupeKey: data.dedupeKey,
      status: "skipped",
      skipReason: "preference_disabled",
      provider: null,
      results: [],
    });
    return {
      delivered: false,
      status: "skipped",
      skipReason: "preference_disabled",
      deviceCount: 0,
    };
  }

  const quietDelay = msUntilQuietHoursEnd(prefs);
  if (quietDelay > 0) {
    return {
      delivered: false,
      status: "skipped",
      skipReason: "quiet_hours",
      deviceCount: 0,
      delayedMs: quietDelay,
    };
  }

  const devices = await listDevicesWithPushToken(data.userId);
  if (devices.length === 0) {
    await createNotificationDelivery({
      userId: data.userId,
      subscriptionId: data.subscriptionId,
      type: data.type,
      title: data.title,
      body: data.body,
      dedupeKey: data.dedupeKey,
      status: "skipped",
      skipReason: "no_push_token",
      provider: "log",
      results: [],
    });
    return {
      delivered: false,
      status: "skipped",
      skipReason: "no_push_token",
      deviceCount: 0,
    };
  }

  const { provider, tickets } = await sendPushMessages(
    devices.map((device) => ({
      to: device.push_token!,
      title: data.title,
      body: data.body,
      data: {
        type: data.type,
        subscriptionId: data.subscriptionId,
        dedupeKey: data.dedupeKey,
      },
    })),
    {
      accessToken: config.push.expoAccessToken ?? undefined,
      forceLog: config.push.forceLog,
    }
  );

  const results: DevicePushResult[] = devices.map((device, index) => {
    const ticket = tickets[index];
    return {
      deviceId: device.id,
      tokenPreview: tokenPreview(device.push_token!),
      status: ticket?.status ?? "error",
      providerMessageId: ticket?.id,
      error: ticket?.message,
    };
  });

  const okCount = results.filter((r) => r.status === "ok").length;
  const status =
    okCount === results.length
      ? "sent"
      : okCount > 0
        ? "partial"
        : "failed";

  await createNotificationDelivery({
    userId: data.userId,
    subscriptionId: data.subscriptionId,
    type: data.type,
    title: data.title,
    body: data.body,
    dedupeKey: data.dedupeKey,
    status,
    skipReason: null,
    provider,
    results,
  });

  if (status === "failed") {
    throw new Error(
      `Push delivery failed for all devices (user=${data.userId} key=${data.dedupeKey})`
    );
  }

  return {
    delivered: true,
    status,
    deviceCount: devices.length,
  };
}

export async function enqueueTestNotification(
  userId: string,
  input: TestNotificationInput
): Promise<NotificationJobData> {
  const stamp = Date.now();
  return {
    userId,
    subscriptionId: null,
    type: input.type,
    title: input.title ?? "MicroSubTracker test",
    body: input.body ?? `Test ${input.type} notification`,
    dedupeKey: `test:${userId}:${input.type}:${stamp}`,
  };
}
