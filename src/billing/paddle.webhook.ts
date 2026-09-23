import { createHmac, timingSafeEqual } from "node:crypto";
import config from "../config/index.js";
import { AppError } from "../utils/errors.js";

/**
 * Verifies Paddle Billing webhook signatures.
 * Header format: `Paddle-Signature: ts=...;h1=...`
 */
export function verifyPaddleWebhookSignature(input: {
  rawBody: Buffer | string;
  signatureHeader: string | undefined;
}): void {
  const secret = config.paddle.webhookSecret;
  if (!secret) {
    throw new AppError(503, "Paddle webhook secret is not configured");
  }

  if (!input.signatureHeader) {
    throw new AppError(401, "Missing Paddle-Signature header");
  }

  const parts = Object.fromEntries(
    input.signatureHeader.split(";").map((part) => {
      const [key, ...rest] = part.split("=");
      return [key?.trim() ?? "", rest.join("=").trim()];
    })
  );

  const ts = parts.ts;
  const h1 = parts.h1;
  if (!ts || !h1) {
    throw new AppError(401, "Invalid Paddle-Signature header");
  }

  const payload =
    typeof input.rawBody === "string"
      ? input.rawBody
      : input.rawBody.toString("utf8");
  const signedPayload = `${ts}:${payload}`;
  const expected = createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(h1, "hex");

  if (
    expectedBuf.length !== providedBuf.length ||
    !timingSafeEqual(expectedBuf, providedBuf)
  ) {
    throw new AppError(401, "Invalid Paddle webhook signature");
  }

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 60 * 5) {
    throw new AppError(401, "Paddle webhook timestamp is too old");
  }
}
