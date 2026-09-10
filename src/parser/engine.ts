import { MERCHANT_PATTERNS, type MerchantPattern } from "./merchants.js";

export const LOW_CONFIDENCE_THRESHOLD = 0.7;

export type ParserSourceType =
  | "sms"
  | "notification"
  | "paste"
  | "receipt_image";

export type NormalizedPayload = {
  text: string;
  sourceType: ParserSourceType;
  sender?: string;
  packageName?: string;
  receivedAt?: string;
};

export type ParseResult = {
  normalized: NormalizedPayload;
  isSubscriptionLike: boolean;
  merchant: string | null;
  merchantKey: string | null;
  amount: number | null;
  currency: string | null;
  confidence: number;
  needsManualEntry: boolean;
  matchedPattern: MerchantPattern | null;
  signals: string[];
};

const SUBSCRIPTION_HINTS =
  /\b(subscription|subscribed|renew(?:al|ed|s)?|membership|recurring|billed|billing|auto[- ]?renew|trial)\b/i;

const AMOUNT_PATTERNS: RegExp[] = [
  /(?:USD|EUR|GBP|CAD|AUD|INR|BDT|JPY|SGD|AED)\s*\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/i,
  /\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/,
  /(?:tk|taka)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/i,
  /([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)\s*(?:USD|EUR|GBP|CAD|AUD|INR|BDT|JPY|SGD|AED)/i,
];

const CURRENCY_PATTERNS: Array<{ code: string; pattern: RegExp }> = [
  { code: "USD", pattern: /\bUSD\b|\$/i },
  { code: "EUR", pattern: /\bEUR\b|€/i },
  { code: "GBP", pattern: /\bGBP\b|£/i },
  { code: "BDT", pattern: /\bBDT\b|\bTK\b|\bTAKA\b/i },
  { code: "INR", pattern: /\bINR\b|₹/i },
  { code: "JPY", pattern: /\bJPY\b|¥/i },
  { code: "CAD", pattern: /\bCAD\b/i },
  { code: "AUD", pattern: /\bAUD\b/i },
  { code: "SGD", pattern: /\bSGD\b/i },
  { code: "AED", pattern: /\bAED\b/i },
];

export function normalizeRawPayload(input: {
  rawPayload: string;
  sourceType: ParserSourceType;
  sender?: string;
  packageName?: string;
  receivedAt?: string;
}): NormalizedPayload {
  const text = input.rawPayload
    .replace(/\s+/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();

  return {
    text,
    sourceType: input.sourceType,
    sender: input.sender?.trim() || undefined,
    packageName: input.packageName?.trim() || undefined,
    receivedAt: input.receivedAt,
  };
}

export function classifySubscriptionLike(text: string): {
  isSubscriptionLike: boolean;
  signals: string[];
} {
  const signals: string[] = [];
  if (SUBSCRIPTION_HINTS.test(text)) {
    signals.push("subscription_keyword");
  }
  if (/(charged|payment|receipt|invoice)/i.test(text)) {
    signals.push("payment_keyword");
  }
  if (/\$|USD|EUR|GBP|BDT|INR|tk/i.test(text)) {
    signals.push("money_symbol");
  }

  return {
    isSubscriptionLike: signals.length > 0,
    signals,
  };
}

export function extractAmount(text: string): number | null {
  for (const pattern of AMOUNT_PATTERNS) {
    const match = text.match(pattern);
    const raw = match?.[1];
    if (!raw) continue;
    const value = Number.parseFloat(raw.replace(/,/g, ""));
    if (!Number.isNaN(value) && value > 0) {
      return Math.round(value * 100) / 100;
    }
  }
  return null;
}

export function extractCurrency(text: string): string | null {
  for (const item of CURRENCY_PATTERNS) {
    if (item.pattern.test(text)) {
      return item.code;
    }
  }
  return null;
}

export function extractMerchant(text: string): {
  merchant: string | null;
  merchantKey: string | null;
  matchedPattern: MerchantPattern | null;
} {
  const lower = text.toLowerCase();
  let best: { pattern: MerchantPattern; alias: string } | null = null;

  for (const pattern of MERCHANT_PATTERNS) {
    for (const alias of pattern.aliases) {
      if (!lower.includes(alias.toLowerCase())) continue;
      if (!best || alias.length > best.alias.length) {
        best = { pattern, alias };
      }
    }
  }

  if (!best) {
    return { merchant: null, merchantKey: null, matchedPattern: null };
  }

  return {
    merchant: best.pattern.name,
    merchantKey: best.pattern.key,
    matchedPattern: best.pattern,
  };
}

export function scoreConfidence(input: {
  isSubscriptionLike: boolean;
  merchantFound: boolean;
  amountFound: boolean;
  currencyFound: boolean;
  signals: string[];
}): number {
  let score = 0;
  if (input.isSubscriptionLike) score += 0.25;
  if (input.merchantFound) score += 0.35;
  if (input.amountFound) score += 0.25;
  if (input.currencyFound) score += 0.1;
  if (input.signals.includes("subscription_keyword")) score += 0.05;

  return Math.min(1, Math.round(score * 1000) / 1000);
}

/**
 * Full pipeline: normalize → classify → extract → confidence.
 * Does not touch the database.
 */
export function runParserPipeline(input: {
  rawPayload: string;
  sourceType: ParserSourceType;
  sender?: string;
  packageName?: string;
  receivedAt?: string;
}): ParseResult {
  const normalized = normalizeRawPayload(input);
  const classification = classifySubscriptionLike(normalized.text);
  const merchant = extractMerchant(normalized.text);
  const amount = extractAmount(normalized.text);
  const currency = extractCurrency(normalized.text) ?? (amount !== null ? "USD" : null);

  const confidence = scoreConfidence({
    isSubscriptionLike: classification.isSubscriptionLike,
    merchantFound: merchant.merchant !== null,
    amountFound: amount !== null,
    currencyFound: currency !== null,
    signals: classification.signals,
  });

  const needsManualEntry =
    !classification.isSubscriptionLike ||
    confidence < LOW_CONFIDENCE_THRESHOLD ||
    merchant.merchant === null ||
    amount === null;

  return {
    normalized,
    isSubscriptionLike: classification.isSubscriptionLike,
    merchant: merchant.merchant,
    merchantKey: merchant.merchantKey,
    amount,
    currency,
    confidence,
    needsManualEntry,
    matchedPattern: merchant.matchedPattern,
    signals: classification.signals,
  };
}
