import config from "../config/index.js";
import { logger } from "../observability/logger.js";
import type { OtpPurpose } from "../types/index.js";
import { AppError } from "../utils/errors.js";

export type EmailProviderName = "log" | "resend";

function purposeLabel(purpose: OtpPurpose): string {
  switch (purpose) {
    case "registration":
      return "confirm your Micro Sub Tracker account";
    case "new_device":
      return "sign in on a new device";
    case "password_reset":
      return "reset your Micro Sub Tracker password";
    default:
      return "verify your email";
  }
}

function buildOtpEmail(code: string, purpose: OtpPurpose): {
  subject: string;
  text: string;
  html: string;
} {
  const action = purposeLabel(purpose);
  const subject = `Your verification code: ${code}`;
  const text = `Your Micro Sub Tracker code is ${code}.\n\nUse it to ${action}.\nThis code expires in ${Math.round(config.auth.otpTtlSeconds / 60)} minutes.\nIf you did not request this, you can ignore this email.`;
  const html = `
    <p>Your Micro Sub Tracker code is <strong style="font-size:20px;letter-spacing:2px">${code}</strong>.</p>
    <p>Use it to ${action}.</p>
    <p>This code expires in ${Math.round(config.auth.otpTtlSeconds / 60)} minutes.</p>
    <p>If you did not request this, you can ignore this email.</p>
  `.trim();

  return { subject, text, html };
}

async function sendViaResend(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const apiKey = config.email.resendApiKey;
  if (!apiKey) {
    throw new AppError(503, "Email provider is not configured (RESEND_API_KEY)");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.email.from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error(
      { status: response.status, body: body.slice(0, 300), to: input.to },
      "otp_email_send_failed"
    );
    throw new AppError(502, "Failed to send verification email");
  }
}

/**
 * Deliver an OTP email.
 * - `log` provider: free forever (dev / portfolio). Code is logged, not emailed.
 * - `resend` provider: Resend free tier (~100 emails/day) for real delivery.
 */
export async function sendOtpEmail(input: {
  to: string;
  code: string;
  purpose: OtpPurpose;
}): Promise<EmailProviderName> {
  const content = buildOtpEmail(input.code, input.purpose);
  const provider = config.email.provider;

  if (provider === "log") {
    logger.info(
      {
        provider,
        to: input.to,
        purpose: input.purpose,
        subject: content.subject,
        ...(config.isDev ? { code: input.code } : { code: "[redacted]" }),
      },
      "otp_email_logged"
    );
    return "log";
  }

  await sendViaResend({
    to: input.to,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });

  logger.info(
    { provider, to: input.to, purpose: input.purpose },
    "otp_email_sent"
  );
  return "resend";
}
