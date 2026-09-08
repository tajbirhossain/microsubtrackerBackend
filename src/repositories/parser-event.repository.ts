import type { Queryable } from "../db/query.js";
import { query, queryOne } from "../db/query.js";
import type { ParserEventRow } from "../types/database.js";
import type { ParserEventStatus, ParserSourceType } from "../types/index.js";

export type CreateParserEventInput = {
  userId: string;
  deviceId: string | null;
  sourceType: ParserSourceType;
  rawPayload: string;
  normalizedPayload: Record<string, unknown>;
  merchant: string | null;
  amount: number | null;
  currency: string | null;
  confidence: number;
  status: ParserEventStatus;
  errorMessage?: string | null;
};

export async function createParserEvent(
  input: CreateParserEventInput,
  client?: Queryable
): Promise<ParserEventRow> {
  const row = await queryOne<ParserEventRow>(
    `
      INSERT INTO parser_events (
        user_id,
        device_id,
        source_type,
        raw_payload,
        normalized_payload,
        merchant,
        amount,
        currency,
        confidence,
        status,
        error_message
      )
      VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `,
    [
      input.userId,
      input.deviceId,
      input.sourceType,
      input.rawPayload,
      JSON.stringify(input.normalizedPayload),
      input.merchant,
      input.amount,
      input.currency,
      input.confidence,
      input.status,
      input.errorMessage ?? null,
    ],
    client
  );

  if (!row) {
    throw new Error("Failed to create parser event");
  }
  return row;
}

export async function findParserEventForUser(
  userId: string,
  eventId: string,
  client?: Queryable
): Promise<ParserEventRow | null> {
  return queryOne<ParserEventRow>(
    `
      SELECT *
      FROM parser_events
      WHERE id = $1
        AND user_id = $2
      LIMIT 1
    `,
    [eventId, userId],
    client
  );
}

export async function listParserEventsForUser(
  input: {
    userId: string;
    status?: ParserEventStatus;
    limit?: number;
  },
  client?: Queryable
): Promise<ParserEventRow[]> {
  const params: unknown[] = [input.userId];
  let statusClause = "";
  if (input.status) {
    params.push(input.status);
    statusClause = `AND status = $${params.length}`;
  }
  params.push(input.limit ?? 50);

  const result = await query<ParserEventRow>(
    `
      SELECT *
      FROM parser_events
      WHERE user_id = $1
        ${statusClause}
      ORDER BY created_at DESC
      LIMIT $${params.length}
    `,
    params,
    client
  );
  return result.rows;
}

export async function updateParserEventStatus(
  input: {
    userId: string;
    eventId: string;
    status: ParserEventStatus;
    subscriptionId?: string | null;
    errorMessage?: string | null;
  },
  client?: Queryable
): Promise<ParserEventRow | null> {
  return queryOne<ParserEventRow>(
    `
      UPDATE parser_events
      SET status = $3,
          subscription_id = COALESCE($4, subscription_id),
          error_message = COALESCE($5, error_message)
      WHERE id = $1
        AND user_id = $2
      RETURNING *
    `,
    [
      input.eventId,
      input.userId,
      input.status,
      input.subscriptionId ?? null,
      input.errorMessage ?? null,
    ],
    client
  );
}
