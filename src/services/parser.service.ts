import { findDeviceByUserAndKey } from "../repositories/device.repository.js";
import { findCategoryForUser } from "../repositories/category.repository.js";
import {
  createParserEvent,
  findParserEventForUser,
  listParserEventsForUser,
  updateParserEventStatus,
} from "../repositories/parser-event.repository.js";
import {
  LOW_CONFIDENCE_THRESHOLD,
  runParserPipeline,
  type ParseResult,
} from "../parser/engine.js";
import {
  isGeminiConfigured,
  parseReceiptWithGemini,
  type GeminiSubscriptionCandidate,
} from "../parser/gemini.js";
import type {
  ConfirmParserInput,
  IngestParserInput,
  ListParserQuery,
} from "../schemas/parser.schemas.js";
import { AppError } from "../utils/errors.js";
import { assertFound } from "../security/ownership.js";
import { logger } from "../observability/logger.js";
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

type CandidateDraft = {
  merchant: string | null;
  amount: number | null;
  currency: string | null;
  confidence: number;
  isSubscriptionLike: boolean;
  needsManualEntry: boolean;
  normalizedPayload: Record<string, unknown>;
  errorMessage: string | null;
};

function fromRegex(parsed: ParseResult): CandidateDraft {
  return {
    merchant: parsed.merchant,
    amount: parsed.amount,
    currency: parsed.currency,
    confidence: parsed.confidence,
    isSubscriptionLike: parsed.isSubscriptionLike,
    needsManualEntry: parsed.needsManualEntry,
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
      engine: "regex",
    },
    errorMessage: null,
  };
}

function fromGemini(candidate: GeminiSubscriptionCandidate): CandidateDraft {
  const hasCoreFields =
    Boolean(candidate.name?.trim()) &&
    Number.isFinite(candidate.amount) &&
    candidate.amount > 0 &&
    candidate.currency.length === 3;

  const needsManualEntry =
    !hasCoreFields ||
    candidate.confidence < LOW_CONFIDENCE_THRESHOLD ||
    !candidate.isSubscriptionLike;

  return {
    merchant: candidate.name,
    amount: candidate.amount,
    currency: candidate.currency,
    confidence: candidate.confidence,
    // Keep trackable service fees even when they are one-time.
    isSubscriptionLike: hasCoreFields ? true : candidate.isSubscriptionLike,
    needsManualEntry,
    normalizedPayload: {
      text: candidate.name,
      sourceType: "gemini",
      signals: candidate.isSubscriptionLike
        ? ["gemini", "subscription_like"]
        : ["gemini", "one_time_service_fee"],
      merchantKey: candidate.merchantKey,
      matchedMerchantKey: candidate.merchantKey,
      categorySlug: candidate.categorySlug,
      defaultBillingCycle: candidate.billingCycle,
      nextBillingDate: candidate.nextBillingDate,
      color: candidate.color,
      icon: candidate.icon,
      recurring: candidate.isSubscriptionLike,
      needsManualEntry,
      lowConfidenceThreshold: LOW_CONFIDENCE_THRESHOLD,
      engine: "gemini",
    },
    errorMessage: !candidate.isSubscriptionLike
      ? "One-time charge — confirm if you still want to track it"
      : needsManualEntry
        ? "Low confidence — confirm manually"
        : null,
  };
}

function shouldPreferGemini(input: IngestParserInput): boolean {
  if (!isGeminiConfigured()) return false;
  if (input.imageBase64) return true;
  if (input.sourceType === "paste" || input.sourceType === "receipt_image") {
    return true;
  }
  const text = input.rawPayload?.trim() ?? "";
  return text.length > 180;
}

export async function ingestParserEvent(
  userId: string,
  input: IngestParserInput
): Promise<{
  events: ParserEventView[];
  event: ParserEventView;
  needsManualEntry: boolean;
  engine: "gemini" | "regex";
}> {
  const rawPayload =
    input.rawPayload?.trim() ||
    (input.imageBase64 ? "[receipt image]" : "");

  let drafts: CandidateDraft[] = [];
  let engine: "gemini" | "regex" = "regex";
  let geminiError: string | null = null;

  if (shouldPreferGemini(input)) {
    try {
      const geminiRows = await parseReceiptWithGemini({
        text: input.rawPayload,
        imageBase64: input.imageBase64,
        imageMimeType: input.imageMimeType,
      });
      engine = "gemini";
      drafts = geminiRows.map(fromGemini);
      if (drafts.length === 0) {
        drafts = [
          {
            merchant: null,
            amount: null,
            currency: null,
            confidence: 0,
            isSubscriptionLike: false,
            needsManualEntry: true,
            normalizedPayload: {
              engine: "gemini",
              signals: [],
              needsManualEntry: true,
            },
            errorMessage: "Could not find a subscription charge in this receipt",
          },
        ];
      }
    } catch (err) {
      geminiError = err instanceof Error ? err.message : String(err);
      logger.warn(
        { err: geminiError },
        "Gemini parse failed — falling back when text is available"
      );
    }
  }

  if (drafts.length === 0) {
    const hasText = Boolean(input.rawPayload?.trim());
    if (!hasText) {
      throw new AppError(
        503,
        geminiError
          ? `Could not read this receipt image: ${geminiError}`
          : "Receipt image parsing requires GEMINI_API_KEY. Paste text instead, or configure Gemini."
      );
    }
    engine = "regex";
    drafts = [
      fromRegex(
        runParserPipeline({
          rawPayload,
          sourceType: input.sourceType,
          sender: input.sender,
          packageName: input.packageName,
          receivedAt: input.receivedAt,
        })
      ),
    ];
  }

  let deviceId: string | null = null;
  if (input.deviceKey) {
    const device = await findDeviceByUserAndKey(userId, input.deviceKey);
    deviceId = device?.id ?? null;
  }

  const events: ParserEventView[] = [];

  for (const draft of drafts) {
    const status =
      !draft.isSubscriptionLike || draft.confidence < 0.35
        ? "failed"
        : "classified";

    const row = await createParserEvent({
      userId,
      deviceId,
      sourceType: input.sourceType,
      rawPayload,
      normalizedPayload: {
        ...draft.normalizedPayload,
        hasImage: Boolean(input.imageBase64),
      },
      merchant: draft.merchant,
      amount: draft.amount,
      currency: draft.currency,
      confidence: draft.confidence,
      status,
      errorMessage:
        status === "failed"
          ? draft.errorMessage ?? "Could not classify as a subscription charge"
          : draft.errorMessage,
    });

    events.push(toParserEventView(row));
  }

  const needsManualEntry = events.some((event) => event.needsManualEntry);
  return {
    events,
    event: events[0]!,
    needsManualEntry,
    engine,
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
  const row = assertFound(
    await findParserEventForUser(userId, eventId),
    "Parser event not found"
  );
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

  let categorySlug =
    input.categorySlug ??
    (typeof normalized.categorySlug === "string"
      ? normalized.categorySlug
      : undefined);
  if (categorySlug) {
    const category = await findCategoryForUser({ userId, slug: categorySlug });
    if (!category) {
      categorySlug = undefined;
    }
  }

  const nextBillingDate =
    input.nextBillingDate ??
    (typeof normalized.nextBillingDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(normalized.nextBillingDate)
      ? normalized.nextBillingDate
      : defaultNextBillingDate(30));

  const subscription = await createUserSubscription(userId, {
    name: merchant,
    amount,
    currency,
    billingCycle,
    categorySlug,
    nextBillingDate,
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
