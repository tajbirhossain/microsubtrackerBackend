import config from "../config/index.js";
import { AppError } from "../utils/errors.js";
import {
  createCheckoutTransaction,
  getPaddleTransaction,
  planFromPriceId,
} from "./paddle.client.js";
import { verifyPaddleWebhookSignature } from "./paddle.webhook.js";
import { toAuthUser } from "../services/auth.mapper.js";
import * as userRepo from "../repositories/user.repository.js";
import { logger } from "../observability/logger.js";
import type { AuthUser, PlanStatus, PlanTier } from "../types/index.js";

export async function startCheckout(input: {
  userId: string;
  email: string;
  plan: PlanTier;
}): Promise<{ checkoutUrl: string; transactionId: string; plan: PlanTier }> {
  if (!config.paddle.apiKey) {
    throw new AppError(503, "Paddle billing is not configured");
  }

  const txn = await createCheckoutTransaction({
    plan: input.plan,
    userId: input.userId,
    email: input.email,
  });

  return {
    checkoutUrl: txn.checkoutUrl,
    transactionId: txn.id,
    plan: input.plan,
  };
}

export async function getBillingStatus(userId: string): Promise<{
  planTier: PlanTier | null;
  planStatus: PlanStatus;
  paddleCustomerId: string | null;
  paddleSubscriptionId: string | null;
}> {
  const user = await userRepo.findActiveUserById(userId);
  if (!user) {
    throw new AppError(401, "Unauthorized");
  }

  return {
    planTier: user.plan_tier ?? null,
    planStatus: user.plan_status ?? "none",
    paddleCustomerId: user.paddle_customer_id,
    paddleSubscriptionId: user.paddle_subscription_id,
  };
}

/**
 * App calls this after checkout closes so unlock doesn't depend only on webhooks.
 */
export async function confirmCheckout(input: {
  userId: string;
  transactionId: string;
}): Promise<{
  planTier: PlanTier | null;
  planStatus: PlanStatus;
  paid: boolean;
}> {
  const txn = await getPaddleTransaction(input.transactionId);
  const status = typeof txn.status === "string" ? txn.status : "";
  const paid =
    status === "completed" ||
    status === "paid" ||
    status === "billed";

  if (!paid) {
    const current = await getBillingStatus(input.userId);
    return {
      planTier: current.planTier,
      planStatus: current.planStatus,
      paid: current.planStatus === "active",
    };
  }

  const custom = asRecord(txn.custom_data);
  const customUserId =
    typeof custom?.userId === "string"
      ? custom.userId
      : typeof custom?.user_id === "string"
        ? custom.user_id
        : null;

  if (customUserId && customUserId !== input.userId) {
    throw new AppError(403, "Transaction does not belong to this user");
  }

  const priceId = readPriceId(txn);
  const planTier =
    planFromPriceId(priceId) ??
    (typeof custom?.plan === "string" ? (custom.plan as PlanTier) : null);

  const customerId =
    typeof txn.customer_id === "string" ? txn.customer_id : null;
  const subscriptionId =
    typeof txn.subscription_id === "string" ? txn.subscription_id : null;

  await userRepo.updateBillingEntitlement(input.userId, {
    planTier: planTier,
    planStatus: "active",
    paddleCustomerId: customerId,
    paddleSubscriptionId: subscriptionId,
  });

  logger.info(
    {
      user_id: input.userId,
      transaction_id: input.transactionId,
      plan_tier: planTier,
    },
    "paddle_checkout_confirmed"
  );

  return {
    planTier,
    planStatus: "active",
    paid: true,
  };
}

type PaddleEvent = {
  event_id?: string;
  event_type?: string;
  data?: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function readCustomUserId(data: Record<string, unknown>): string | null {
  const custom = asRecord(data.custom_data);
  const userId = custom?.userId ?? custom?.user_id;
  return typeof userId === "string" && userId.length > 0 ? userId : null;
}

function readPriceId(data: Record<string, unknown>): string | null {
  const items = data.items;
  if (Array.isArray(items) && items.length > 0) {
    const first = asRecord(items[0]);
    const price = asRecord(first?.price);
    if (typeof price?.id === "string") return price.id;
    if (typeof first?.price_id === "string") return first.price_id;
  }

  const details = asRecord(data.details);
  const lineItems = details?.line_items;
  if (Array.isArray(lineItems) && lineItems.length > 0) {
    const first = asRecord(lineItems[0]);
    const price = asRecord(first?.price);
    if (typeof price?.id === "string") return price.id;
  }

  return null;
}

function statusFromPaddle(status: unknown): PlanStatus {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
    case "cancelled":
      return "canceled";
    default:
      return "none";
  }
}

async function resolveUserId(data: Record<string, unknown>): Promise<string | null> {
  const fromCustom = readCustomUserId(data);
  if (fromCustom) return fromCustom;

  const subscriptionId =
    typeof data.id === "string" && String(data.id).startsWith("sub_")
      ? data.id
      : typeof data.subscription_id === "string"
        ? data.subscription_id
        : null;

  if (subscriptionId) {
    const bySub = await userRepo.findActiveUserByPaddleSubscriptionId(subscriptionId);
    if (bySub) return bySub.id;
  }

  const customerId =
    typeof data.customer_id === "string"
      ? data.customer_id
      : typeof asRecord(data.customer)?.id === "string"
        ? (asRecord(data.customer)!.id as string)
        : null;

  if (customerId) {
    const byCustomer = await userRepo.findActiveUserByPaddleCustomerId(customerId);
    if (byCustomer) return byCustomer.id;
  }

  return null;
}

export async function handlePaddleWebhook(input: {
  rawBody: Buffer;
  signatureHeader: string | undefined;
}): Promise<{ ok: true; eventType: string | null }> {
  verifyPaddleWebhookSignature(input);

  const event = JSON.parse(input.rawBody.toString("utf8")) as PaddleEvent;
  const eventType = event.event_type ?? null;
  const data = asRecord(event.data) ?? {};

  logger.info(
    { event_type: eventType, event_id: event.event_id },
    "paddle_webhook_received"
  );

  if (!eventType) {
    return { ok: true, eventType: null };
  }

  if (
    eventType === "subscription.activated" ||
    eventType === "subscription.created" ||
    eventType === "subscription.updated" ||
    eventType === "subscription.past_due" ||
    eventType === "subscription.canceled" ||
    eventType === "transaction.completed"
  ) {
    const userId = await resolveUserId(data);
    if (!userId) {
      logger.warn(
        { event_type: eventType, event_id: event.event_id },
        "paddle_webhook_user_not_found"
      );
      return { ok: true, eventType };
    }

    const priceId = readPriceId(data);
    const planTier =
      planFromPriceId(priceId) ??
      (typeof asRecord(data.custom_data)?.plan === "string"
        ? (asRecord(data.custom_data)!.plan as PlanTier)
        : null);

    const paddleStatus = data.status;
    let planStatus = statusFromPaddle(paddleStatus);

    if (eventType === "subscription.canceled") {
      planStatus = "canceled";
    } else if (eventType === "subscription.past_due") {
      planStatus = "past_due";
    } else if (
      eventType === "subscription.activated" ||
      eventType === "subscription.created" ||
      eventType === "transaction.completed"
    ) {
      planStatus = "active";
    }

    const subscriptionId =
      typeof data.id === "string" && data.id.startsWith("sub_")
        ? data.id
        : typeof data.subscription_id === "string"
          ? data.subscription_id
          : null;

    const customerId =
      typeof data.customer_id === "string" ? data.customer_id : null;

    const existing = await userRepo.findActiveUserById(userId);
    const nextTier =
      planStatus === "canceled"
        ? existing?.plan_tier ?? planTier
        : planTier ?? existing?.plan_tier ?? null;

    await userRepo.updateBillingEntitlement(userId, {
      planTier: nextTier,
      planStatus,
      paddleCustomerId: customerId,
      paddleSubscriptionId: subscriptionId,
    });

    logger.info(
      {
        user_id: userId,
        plan_tier: nextTier,
        plan_status: planStatus,
        event_type: eventType,
      },
      "paddle_entitlement_updated"
    );
  }

  return { ok: true, eventType };
}

export async function getCurrentAuthUser(userId: string): Promise<AuthUser> {
  const user = await userRepo.findActiveUserById(userId);
  if (!user) {
    throw new AppError(401, "Unauthorized");
  }
  return toAuthUser(user);
}
