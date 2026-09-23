import fs from "node:fs";
import { google } from "googleapis";
import config from "../config/index.js";
import { AppError } from "../utils/errors.js";
import type { PlanTier } from "../types/index.js";

export type GoogleSubscriptionVerification = {
  productId: string;
  orderId: string | null;
  purchaseToken: string;
  subscriptionState: string;
  active: boolean;
  planTier: PlanTier;
};

function loadServiceAccountCredentials(): object {
  const raw = config.googlePlay.serviceAccountJson;
  if (!raw) {
    throw new AppError(503, "Google Play billing is not configured");
  }

  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed) as object;
    } catch {
      throw new AppError(503, "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is invalid JSON");
    }
  }

  try {
    const file = fs.readFileSync(trimmed, "utf8");
    return JSON.parse(file) as object;
  } catch {
    throw new AppError(
      503,
      "Could not read Google Play service account JSON file"
    );
  }
}

export function planFromProductId(productId: string): PlanTier | null {
  if (productId === config.googlePlay.products.plus) return "plus";
  if (productId === config.googlePlay.products.pro) return "pro";
  return null;
}

export function productIdForPlan(plan: PlanTier): string {
  const id =
    plan === "plus"
      ? config.googlePlay.products.plus
      : config.googlePlay.products.pro;
  if (!id) {
    throw new AppError(503, `Google Play product for ${plan} is not configured`);
  }
  return id;
}

function isActiveSubscriptionState(state: string | null | undefined): boolean {
  if (!state) return false;
  return (
    state === "SUBSCRIPTION_STATE_ACTIVE" ||
    state === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD" ||
    state === "SUBSCRIPTION_STATE_ON_HOLD"
  );
}

async function getAndroidPublisher() {
  const credentials = loadServiceAccountCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  return google.androidpublisher({ version: "v3", auth });
}

export async function verifyGoogleSubscriptionPurchase(input: {
  purchaseToken: string;
  productId: string;
  packageName?: string;
}): Promise<GoogleSubscriptionVerification> {
  if (!config.googlePlay.packageName) {
    throw new AppError(503, "GOOGLE_PLAY_PACKAGE_NAME is not configured");
  }

  const packageName = input.packageName ?? config.googlePlay.packageName;
  if (packageName !== config.googlePlay.packageName) {
    throw new AppError(400, "Package name does not match this app");
  }

  const planTier = planFromProductId(input.productId);
  if (!planTier) {
    throw new AppError(400, "Unknown Google Play product");
  }

  const publisher = await getAndroidPublisher();

  let subscriptionState = "";
  let orderId: string | null = null;
  let resolvedProductId = input.productId;

  try {
    const { data } = await publisher.purchases.subscriptionsv2.get({
      packageName,
      token: input.purchaseToken,
    });

    subscriptionState = data.subscriptionState ?? "";
    const firstLine = data.lineItems?.[0];
    orderId =
      typeof firstLine?.latestSuccessfulOrderId === "string"
        ? firstLine.latestSuccessfulOrderId
        : null;

    const lineProductId = firstLine?.productId;
    if (typeof lineProductId === "string" && lineProductId.length > 0) {
      resolvedProductId = lineProductId;
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Google Play verification failed";
    throw new AppError(400, `Invalid Google Play purchase: ${message}`);
  }

  const resolvedPlan = planFromProductId(resolvedProductId);
  if (!resolvedPlan) {
    throw new AppError(400, "Purchase product is not a known plan");
  }

  if (resolvedProductId !== input.productId) {
    throw new AppError(400, "Purchase product does not match selected plan");
  }

  return {
    productId: resolvedProductId,
    orderId,
    purchaseToken: input.purchaseToken,
    subscriptionState,
    active: isActiveSubscriptionState(subscriptionState),
    planTier: resolvedPlan,
  };
}
