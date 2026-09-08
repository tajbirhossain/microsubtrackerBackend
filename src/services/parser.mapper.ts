import type { ParserEventRow } from "../types/database.js";
import type { ParserEventStatus, ParserSourceType } from "../types/index.js";
import { LOW_CONFIDENCE_THRESHOLD } from "../parser/engine.js";

export type ParserEventView = {
  id: string;
  sourceType: ParserSourceType;
  rawPayload: string;
  merchant: string | null;
  amount: number | null;
  currency: string | null;
  confidence: number | null;
  status: ParserEventStatus;
  needsManualEntry: boolean;
  subscriptionId: string | null;
  normalizedPayload: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export function toParserEventView(row: ParserEventRow): ParserEventView {
  const confidence =
    row.confidence === null || row.confidence === undefined
      ? null
      : Number(row.confidence);

  const needsManualEntry =
    row.status === "failed" ||
    confidence === null ||
    confidence < LOW_CONFIDENCE_THRESHOLD ||
    !row.merchant ||
    row.amount === null;

  return {
    id: row.id,
    sourceType: row.source_type,
    rawPayload: row.raw_payload,
    merchant: row.merchant,
    amount: row.amount === null ? null : Number(row.amount),
    currency: row.currency,
    confidence,
    status: row.status,
    needsManualEntry,
    subscriptionId: row.subscription_id,
    normalizedPayload: row.normalized_payload,
    errorMessage: row.error_message,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
