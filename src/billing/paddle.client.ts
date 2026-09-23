import config from "../config/index.js";
import { AppError } from "../utils/errors.js";
import type { PlanTier } from "../types/index.js";

type PaddleJson = {
  data?: unknown;
  error?: { detail?: string; code?: string };
};

export type PaddleCheckoutTransaction = {
  id: string;
  checkoutUrl: string;
};

function assertPaddleConfigured(): {
  apiKey: string;
  apiBaseUrl: string;
} {
  const apiKey = config.paddle.apiKey;
  if (!apiKey) {
    throw new AppError(503, "Paddle billing is not configured");
  }
  return { apiKey, apiBaseUrl: config.paddle.apiBaseUrl };
}

export function priceIdForPlan(plan: PlanTier): string {
  const priceId =
    plan === "plus" ? config.paddle.prices.plus : config.paddle.prices.pro;
  if (!priceId) {
    throw new AppError(503, `Paddle price for ${plan} is not configured`);
  }
  return priceId;
}

export function planFromPriceId(priceId: string | null | undefined): PlanTier | null {
  if (!priceId) return null;
  if (priceId === config.paddle.prices.plus) return "plus";
  if (priceId === config.paddle.prices.pro) return "pro";
  return null;
}

function publicCheckoutBaseUrl(): string {
  const base = config.auth.appPublicUrl.replace(/\/$/, "");
  if (!base.startsWith("https://") || base.includes("localhost")) {
    throw new AppError(
      503,
      "APP_PUBLIC_URL must be a public https URL (not localhost) for Paddle checkout"
    );
  }
  return base;
}

async function paddleFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const { apiKey, apiBaseUrl } = assertPaddleConfigured();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const json = (await response.json()) as PaddleJson;
  if (!response.ok) {
    throw new AppError(
      502,
      json.error?.detail ?? `Paddle request failed (${response.status})`
    );
  }

  return json.data as T;
}

type CreateTransactionResult = {
  id: string;
  checkout?: { url?: string | null } | null;
};

export async function createCheckoutTransaction(input: {
  plan: PlanTier;
  userId: string;
  email: string;
}): Promise<PaddleCheckoutTransaction> {
  const priceId = priceIdForPlan(input.plan);
  const base = publicCheckoutBaseUrl();
  // Override Paddle's default payment link (often localhost in sandbox).
  // Resulting checkout.url = `${base}/checkout?_ptxn=txn_...`
  const checkoutPageUrl = `${base}/checkout`;
  const successUrl = `${base}/billing/return`;

  const data = await paddleFetch<CreateTransactionResult>("/transactions", {
    method: "POST",
    body: JSON.stringify({
      items: [{ price_id: priceId, quantity: 1 }],
      custom_data: {
        userId: input.userId,
        plan: input.plan,
        email: input.email,
      },
      checkout: {
        url: checkoutPageUrl,
        success_url: successUrl,
      },
    }),
  });

  const checkoutUrl =
    data.checkout?.url && !data.checkout.url.includes("localhost")
      ? data.checkout.url
      : `${checkoutPageUrl}?_ptxn=${encodeURIComponent(data.id)}`;

  if (checkoutUrl.includes("localhost")) {
    throw new AppError(
      502,
      "Paddle returned a localhost checkout URL. Set Default payment link / checkout.url to your https API host."
    );
  }

  return {
    id: data.id,
    checkoutUrl,
  };
}

export async function getPaddleTransaction(
  transactionId: string
): Promise<Record<string, unknown>> {
  const data = await paddleFetch<Record<string, unknown>>(
    `/transactions/${encodeURIComponent(transactionId)}`
  );
  return data;
}
