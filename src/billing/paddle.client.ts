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
  successUrl: string;
}): Promise<PaddleCheckoutTransaction> {
  const priceId = priceIdForPlan(input.plan);

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
        success_url: input.successUrl,
      },
    }),
  });

  const checkoutUrl = data.checkout?.url;
  if (!checkoutUrl) {
    throw new AppError(502, "Paddle did not return a checkout URL");
  }

  return {
    id: data.id,
    checkoutUrl,
  };
}
