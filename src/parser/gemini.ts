import config from "../config/index.js";
import { logger } from "../observability/logger.js";
import { extractAmount, extractCurrency, extractMerchant } from "./engine.js";
import type { BillingCycle } from "../types/index.js";

export type GeminiSubscriptionCandidate = {
  name: string;
  amount: number;
  currency: string;
  billingCycle: BillingCycle;
  nextBillingDate: string | null;
  categorySlug: string | null;
  confidence: number;
  isSubscriptionLike: boolean;
  merchantKey: string | null;
  color: string | null;
  icon: string | null;
  engine: "gemini";
};

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    subscriptions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          amount: { type: "NUMBER" },
          currency: { type: "STRING" },
          billingCycle: {
            type: "STRING",
            enum: ["weekly", "monthly", "yearly"],
          },
          nextBillingDate: { type: "STRING", nullable: true },
          categorySlug: { type: "STRING", nullable: true },
          confidence: { type: "NUMBER" },
          isSubscriptionLike: { type: "BOOLEAN" },
        },
        required: [
          "name",
          "amount",
          "currency",
          "billingCycle",
          "confidence",
          "isSubscriptionLike",
        ],
      },
    },
  },
  required: ["subscriptions"],
} as const;

function stripDataUrl(base64: string): string {
  const marker = "base64,";
  const idx = base64.indexOf(marker);
  return idx >= 0 ? base64.slice(idx + marker.length) : base64;
}

function normalizeCycle(raw: unknown): BillingCycle {
  if (raw === "weekly" || raw === "yearly" || raw === "monthly") return raw;
  return "monthly";
}

function normalizeDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

function enrichWithCatalog(candidate: {
  name: string;
  amount: number;
  currency: string;
  billingCycle: BillingCycle;
  nextBillingDate: string | null;
  categorySlug: string | null;
  confidence: number;
  isSubscriptionLike: boolean;
}): GeminiSubscriptionCandidate {
  const matched = extractMerchant(
    `${candidate.name} ${candidate.categorySlug ?? ""}`
  );
  return {
    ...candidate,
    categorySlug:
      candidate.categorySlug ?? matched.matchedPattern?.categorySlug ?? null,
    merchantKey: matched.merchantKey,
    color: matched.matchedPattern?.color ?? null,
    icon: matched.matchedPattern?.icon ?? null,
    engine: "gemini",
  };
}

export function isGeminiConfigured(): boolean {
  return Boolean(config.gemini.apiKey);
}

export async function parseReceiptWithGemini(input: {
  text?: string;
  imageBase64?: string;
  imageMimeType?: string;
}): Promise<GeminiSubscriptionCandidate[]> {
  if (!config.gemini.apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const parts: Array<Record<string, unknown>> = [
    {
      text: `You extract trackable service charges from receipts, invoices, bank alerts, and payment emails.

Always fill every field when a charge is present:
- name: the merchant/brand at the top of the receipt (e.g. "Google", "Netflix", "Spotify"). Never leave name empty if a brand/logo word is visible. Prefer the company name over the line-item description.
- amount: the final Total charged (ignore tax/subtotal if Total exists). Must be a number.
- currency: 3-letter ISO code. If you only see $, use USD.
- billingCycle: monthly for unclear recurring; yearly for annual/registration fees; weekly only if clearly weekly.
- isSubscriptionLike: true for recurring memberships; false for one-time service fees (registration, setup, console fees). Still return those one-time service fees.
- nextBillingDate: YYYY-MM-DD when known, else null.
- categorySlug: short kebab-case when obvious.
- confidence: 0-1.

Do NOT include ordinary retail/grocery shopping.
If a receipt clearly shows Google / Apple / Microsoft / Netflix (etc.) plus a total, you MUST return at least one subscription object with that merchant name and total.
If nothing is a service charge, return {"subscriptions":[]}.`,
    },
  ];

  if (input.text?.trim()) {
    parts.push({ text: `Document text:\n${input.text.trim()}` });
  }

  if (input.imageBase64) {
    parts.push({
      inlineData: {
        mimeType: input.imageMimeType ?? "image/jpeg",
        data: stripDataUrl(input.imageBase64),
      },
    });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    config.gemini.model
  )}:generateContent`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": config.gemini.apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });

  const payload = (await response.json()) as {
    error?: { message?: string };
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  if (!response.ok) {
    const message = payload.error?.message ?? `Gemini HTTP ${response.status}`;
    logger.warn({ err: message }, "Gemini parse request failed");
    throw new Error(message);
  }

  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini returned an empty response");
  }

  let parsed: { subscriptions?: unknown };
  try {
    parsed = JSON.parse(text) as { subscriptions?: unknown };
  } catch {
    throw new Error("Gemini returned invalid JSON");
  }

  const rows = Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [];
  const results: GeminiSubscriptionCandidate[] = [];
  const sourceBlob = `${input.text ?? ""}`;

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    let name = typeof item.name === "string" ? item.name.trim() : "";
    const amount = typeof item.amount === "number" ? item.amount : Number(item.amount);
    let currency =
      typeof item.currency === "string" ? item.currency.trim().toUpperCase() : "";
    const confidence =
      typeof item.confidence === "number"
        ? Math.min(1, Math.max(0, item.confidence))
        : 0.5;
    const isSubscriptionLike = Boolean(item.isSubscriptionLike);

    if ((!name || name.toLowerCase() === "unknown") && sourceBlob) {
      const recovered = extractMerchant(sourceBlob);
      if (recovered.merchant) name = recovered.merchant;
    }

    if (!currency && /\$/.test(sourceBlob)) {
      currency = "USD";
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }
    if (!currency) {
      currency = /\$/.test(sourceBlob) ? "USD" : "";
    }
    if (currency.length !== 3) {
      continue;
    }
    if (!name) {
      name = "Unknown";
    }

    results.push(
      enrichWithCatalog({
        name,
        amount: Math.round(amount * 100) / 100,
        currency,
        billingCycle: normalizeCycle(item.billingCycle),
        nextBillingDate: normalizeDate(item.nextBillingDate),
        categorySlug:
          typeof item.categorySlug === "string" && item.categorySlug.trim()
            ? item.categorySlug.trim().toLowerCase()
            : null,
        confidence,
        isSubscriptionLike,
      })
    );
  }

  if (results.length === 0 && sourceBlob.trim()) {
    const recovered = extractMerchant(sourceBlob);
    const amount = extractAmount(sourceBlob);
    const currency = extractCurrency(sourceBlob) ?? (amount !== null ? "USD" : null);
    if (recovered.merchant && amount !== null && currency) {
      results.push(
        enrichWithCatalog({
          name: recovered.merchant,
          amount,
          currency,
          billingCycle: recovered.matchedPattern?.defaultBillingCycle ?? "monthly",
          nextBillingDate: null,
          categorySlug: recovered.matchedPattern?.categorySlug ?? null,
          confidence: 0.72,
          isSubscriptionLike: false,
        })
      );
    }
  }

  return results;
}
