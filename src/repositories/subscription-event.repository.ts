import type { Queryable } from "../db/query.js";
import { query, queryOne } from "../db/query.js";
import type { SubscriptionEventRow } from "../types/database.js";
import type { SubscriptionEventType } from "../types/index.js";

export async function createSubscriptionEvent(
  input: {
    subscriptionId: string;
    userId: string;
    eventType: SubscriptionEventType;
    payload?: Record<string, unknown>;
  },
  client?: Queryable
): Promise<SubscriptionEventRow> {
  const row = await queryOne<SubscriptionEventRow>(
    `
      INSERT INTO subscription_events (
        subscription_id,
        user_id,
        event_type,
        payload
      )
      VALUES ($1, $2, $3, $4::jsonb)
      RETURNING *
    `,
    [
      input.subscriptionId,
      input.userId,
      input.eventType,
      JSON.stringify(input.payload ?? {}),
    ],
    client
  );

  if (!row) {
    throw new Error("Failed to create subscription event");
  }

  return row;
}

export async function listSubscriptionEvents(
  input: { subscriptionId: string; userId: string; limit?: number },
  client?: Queryable
): Promise<SubscriptionEventRow[]> {
  const result = await query<SubscriptionEventRow>(
    `
      SELECT *
      FROM subscription_events
      WHERE subscription_id = $1
        AND user_id = $2
      ORDER BY created_at DESC
      LIMIT $3
    `,
    [input.subscriptionId, input.userId, input.limit ?? 50],
    client
  );
  return result.rows;
}
