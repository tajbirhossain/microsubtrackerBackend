import config from "../config/index.js";
import { AppError } from "../utils/errors.js";
import { logger } from "../observability/logger.js";
import * as userRepo from "../repositories/user.repository.js";
import {
  verifyGoogleSubscriptionPurchase,
} from "./google.client.js";
import type { PlanStatus, PlanTier } from "../types/index.js";

export async function getBillingStatus(userId: string): Promise<{
  planTier: PlanTier | null;
  planStatus: PlanStatus;
  googleProductId: string | null;
  googleOrderId: string | null;
}> {
  const user = await userRepo.findActiveUserById(userId);
  if (!user) {
    throw new AppError(404, "User not found");
  }

  return {
    planTier: user.plan_tier ?? null,
    planStatus: user.plan_status,
    googleProductId: user.google_product_id,
    googleOrderId: user.google_order_id,
  };
}

export async function confirmGooglePurchase(input: {
  userId: string;
  productId: string;
  purchaseToken: string;
  packageName?: string;
}): Promise<{
  planTier: PlanTier | null;
  planStatus: PlanStatus;
  paid: boolean;
}> {
  if (!config.googlePlay.serviceAccountJson || !config.googlePlay.packageName) {
    throw new AppError(503, "Google Play billing is not configured");
  }

  const verified = await verifyGoogleSubscriptionPurchase({
    purchaseToken: input.purchaseToken,
    productId: input.productId,
    packageName: input.packageName,
  });

  if (!verified.active) {
    const current = await getBillingStatus(input.userId);
    return {
      planTier: current.planTier,
      planStatus: current.planStatus,
      paid: current.planStatus === "active",
    };
  }

  const existingOwner = await userRepo.findActiveUserByGooglePurchaseToken(
    verified.purchaseToken
  );
  if (existingOwner && existingOwner.id !== input.userId) {
    throw new AppError(409, "This purchase is already linked to another account");
  }

  await userRepo.updateBillingEntitlement(input.userId, {
    planTier: verified.planTier,
    planStatus: "active",
    googleProductId: verified.productId,
    googlePurchaseToken: verified.purchaseToken,
    googleOrderId: verified.orderId,
  });

  logger.info(
    {
      user_id: input.userId,
      product_id: verified.productId,
      order_id: verified.orderId,
      subscription_state: verified.subscriptionState,
    },
    "google_play_purchase_confirmed"
  );

  return {
    planTier: verified.planTier,
    planStatus: "active",
    paid: true,
  };
}
