import type { Queryable } from "../db/query.js";
import { queryAll, queryOne } from "../db/query.js";
import type { NotificationDeliveryRow } from "../types/database.js";
import type { NotificationDeliveryStatus, NotificationType } from "../types/index.js";

export type DevicePushResult = {
  deviceId: string;
  tokenPreview: string;
  status: "ok" | "error";
  providerMessageId?: string;
  error?: string;
};

export type CreateNotificationDeliveryInput = {
  userId: string;
  subscriptionId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  dedupeKey: string;
  status: NotificationDeliveryStatus;
  skipReason?: string | null;
  provider?: string | null;
  results?: DevicePushResult[];
};

export async function createNotificationDelivery(
  input: CreateNotificationDeliveryInput,
  client?: Queryable
): Promise<NotificationDeliveryRow> {
  const row = await queryOne<NotificationDeliveryRow>(
    `
      INSERT INTO notification_deliveries (
        user_id,
        subscription_id,
        type,
        title,
        body,
        dedupe_key,
        status,
        skip_reason,
        provider,
        results,
        completed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW())
      ON CONFLICT (dedupe_key) DO UPDATE SET
        status = EXCLUDED.status,
        skip_reason = EXCLUDED.skip_reason,
        provider = EXCLUDED.provider,
        results = EXCLUDED.results,
        completed_at = NOW()
      RETURNING *
    `,
    [
      input.userId,
      input.subscriptionId ?? null,
      input.type,
      input.title,
      input.body,
      input.dedupeKey,
      input.status,
      input.skipReason ?? null,
      input.provider ?? null,
      JSON.stringify(input.results ?? []),
    ],
    client
  );

  if (!row) {
    throw new Error("Failed to record notification delivery");
  }

  return row;
}

export async function findDeliveryByDedupeKey(
  dedupeKey: string,
  client?: Queryable
): Promise<NotificationDeliveryRow | null> {
  return queryOne<NotificationDeliveryRow>(
    `
      SELECT *
      FROM notification_deliveries
      WHERE dedupe_key = $1
      LIMIT 1
    `,
    [dedupeKey],
    client
  );
}

export async function listDeliveriesForUser(
  userId: string,
  limit = 50,
  client?: Queryable
): Promise<NotificationDeliveryRow[]> {
  return queryAll<NotificationDeliveryRow>(
    `
      SELECT *
      FROM notification_deliveries
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [userId, limit],
    client
  );
}
