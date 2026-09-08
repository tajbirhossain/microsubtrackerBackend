import { findDeviceByUserAndKey } from "../repositories/device.repository.js";
import {
  createParserEvent,
  findParserEventForUser,
  listParserEventsForUser,
  updateParserEventStatus,
} from "../repositories/parser-event.repository.js";
import { LOW_CONFIDENCE_THRESHOLD, runParserPipeline } from "../parser/engine.js";
import type {
  ConfirmParserInput,
  IngestParserInput,
  ListParserQuery,
} from "../schemas/parser.schemas.js";
import { AppError } from "../utils/errors.js";
import {
  toParserEventView,
  type ParserEventView,
} from "./parser.mapper.js";
import type { SubscriptionView } from "./subscription.mapper.js";
import { createUserSubscription } from "./subscription.service.js";

function defaultNextBillingDate(daysFromNow = 30): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

export async function ingestParserEvent(
  userId: string,
  input: IngestParserInput
): Promise<{
  event: ParserEventView;
  needsManualEntry: boolean;
}> {
  // Pipeline first — never write raw SMS straight into business tables.
  const parsed = runParserPipeline({
    rawPayload: input.rawPayload,
    sourceType: input.sourceType,
    sender: input.sender,
    packageName: input.packageName,
    receivedAt: input.receivedAt,
  });

  let deviceId: string | null = null;
  if (input.deviceKey) {
    const device = await findDeviceByUserAndKey(userId, input.deviceKey);
    deviceId = device?.id ?? null;
  }

  const status =
    !parsed.isSubscriptionLike || parsed.confidence < 0.35
      ? "failed"
      : "classified";

  const row = await createParserEvent({
    userId,
    deviceId,
    sourceType: input.sourceType,
    rawPayload: input.rawPayload,
    normalizedPayload: {
      ...parsed.normalized,
      signals: parsed.signals,
      merchantKey: parsed.merchantKey,
      matchedMerchantKey: parsed.matchedPattern?.key ?? null,
      categorySlug: parsed.matchedPattern?.categorySlug ?? null,
      defaultBillingCycle: parsed.matchedPattern?.defaultBillingCycle ?? null,
      color: parsed.matchedPattern?.color ?? null,
      icon: parsed.matchedPattern?.icon ?? null,
      needsManualEntry: parsed.needsManualEntry,
      lowConfidenceThreshold: LOW_CONFIDENCE_THRESHOLD,
    },
    merchant: parsed.merchant,
    amount: parsed.amount,
    currency: parsed.currency,
    confidence: parsed.confidence,
    status,
    errorMessage:
      status === "failed"
        ? "Could not classify as a subscription charge"
        : parsed.needsManualEntry
          ? "Low confidence — confirm manually"
          : null,
  });

  const event = toParserEventView(row);
  return {
    event,
    needsManualEntry: event.needsManualEntry,
  };
}

export async function listParserCandidates(
  userId: string,
  query: ListParserQuery
): Promise<ParserEventView[]> {
  const rows = await listParserEventsForUser({
    userId,
    status: query.status ?? "classified",
    limit: query.limit ?? 50,
  });
  return rows.map(toParserEventView);
}

export async function getParserEvent(
  userId: string,
  eventId: string
): Promise<ParserEventView> {
  const row = await findParserEventForUser(userId, eventId);
  if (!row) {
    throw new AppError(404, "Parser event not found");
  }
  return toParserEventView(row);
}

export async function confirmParserEvent(
  userId: string,
  eventId: string,
  input: ConfirmParserInput
): Promise<{ event: ParserEventView; subscription: SubscriptionView }> {
  const existing = await findParserEventForUser(userId, eventId);
  if (!existing) {
    throw new AppError(404, "Parser event not found");
  }
  if (existing.status === "confirmed") {
    throw new AppError(409, "Parser event already confirmed");
  }
  if (existing.status === "rejected") {
    throw new AppError(409, "Parser event was rejected");
  }

  const normalized = (existing.normalized_payload ?? {}) as Record<
    string,
    unknown
  >;
  const amount =
    input.amount ?? (existing.amount !== null ? Number(existing.amount) : null);
  const merchant = input.name ?? existing.merchant;
  const currency = input.currency ?? existing.currency ?? "USD";

  if (!merchant || amount === null || amount <= 0) {
    throw new AppError(
      400,
      "Manual fields required: name and amount must be provided for this candidate"
    );
  }

  const billingCycle =
    input.billingCycle ??
    (normalized.defaultBillingCycle === "weekly" ||
    normalized.defaultBillingCycle === "monthly" ||
    normalized.defaultBillingCycle === "yearly"
      ? normalized.defaultBillingCycle
      : "monthly");

  const categorySlug =
    input.categorySlug ??
    (typeof normalized.categorySlug === "string"
      ? normalized.categorySlug
      : undefined);

  const subscription = await createUserSubscription(userId, {
    name: merchant,
    amount,
    currency,
    billingCycle,
    categorySlug,
    nextBillingDate: input.nextBillingDate ?? defaultNextBillingDate(30),
    providerKey:
      typeof normalized.merchantKey === "string"
        ? normalized.merchantKey
        : undefined,
    color: typeof normalized.color === "string" ? normalized.color : undefined,
    icon: typeof normalized.icon === "string" ? normalized.icon : undefined,
    status: "active",
    isTrial: false,
  });

  const updated = await updateParserEventStatus({
    userId,
    eventId,
    status: "confirmed",
    subscriptionId: subscription.id,
    errorMessage: null,
  });

  if (!updated) {
    throw new AppError(500, "Failed to update parser event");
  }

  return {
    event: toParserEventView(updated),
    subscription,
  };
}

export async function rejectParserEvent(
  userId: string,
  eventId: string
): Promise<ParserEventView> {
  const existing = await findParserEventForUser(userId, eventId);
  if (!existing) {
    throw new AppError(404, "Parser event not found");
  }
  if (existing.status === "confirmed") {
    throw new AppError(409, "Confirmed events cannot be rejected");
  }

  const updated = await updateParserEventStatus({
    userId,
    eventId,
    status: "rejected",
  });

  if (!updated) {
    throw new AppError(500, "Failed to reject parser event");
  }

  return toParserEventView(updated);
}
