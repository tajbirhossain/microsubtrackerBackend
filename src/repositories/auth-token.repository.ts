import type { Queryable } from "../db/query.js";
import { query, queryOne } from "../db/query.js";
import type {
  EmailVerificationTokenRow,
  PasswordResetTokenRow,
} from "../types/database.js";

export async function createEmailVerificationToken(
  input: { userId: string; tokenHash: string; expiresAt: Date },
  client?: Queryable
): Promise<EmailVerificationTokenRow> {
  await query(
    `
      UPDATE email_verification_tokens
      SET used_at = NOW()
      WHERE user_id = $1
        AND used_at IS NULL
    `,
    [input.userId],
    client
  );

  const row = await queryOne<EmailVerificationTokenRow>(
    `
      INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
      RETURNING *
    `,
    [input.userId, input.tokenHash, input.expiresAt],
    client
  );

  if (!row) {
    throw new Error("Failed to create email verification token");
  }

  return row;
}

export async function consumeEmailVerificationToken(
  tokenHash: string,
  client?: Queryable
): Promise<EmailVerificationTokenRow | null> {
  return queryOne<EmailVerificationTokenRow>(
    `
      UPDATE email_verification_tokens
      SET used_at = NOW()
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > NOW()
      RETURNING *
    `,
    [tokenHash],
    client
  );
}

export async function createPasswordResetToken(
  input: { userId: string; tokenHash: string; expiresAt: Date },
  client?: Queryable
): Promise<PasswordResetTokenRow> {
  await query(
    `
      UPDATE password_reset_tokens
      SET used_at = NOW()
      WHERE user_id = $1
        AND used_at IS NULL
    `,
    [input.userId],
    client
  );

  const row = await queryOne<PasswordResetTokenRow>(
    `
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
      RETURNING *
    `,
    [input.userId, input.tokenHash, input.expiresAt],
    client
  );

  if (!row) {
    throw new Error("Failed to create password reset token");
  }

  return row;
}

export async function consumePasswordResetToken(
  tokenHash: string,
  client?: Queryable
): Promise<PasswordResetTokenRow | null> {
  return queryOne<PasswordResetTokenRow>(
    `
      UPDATE password_reset_tokens
      SET used_at = NOW()
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > NOW()
      RETURNING *
    `,
    [tokenHash],
    client
  );
}
