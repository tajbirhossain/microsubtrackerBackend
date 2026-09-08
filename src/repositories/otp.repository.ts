import type { Queryable } from "../db/query.js";
import { query, queryOne } from "../db/query.js";
import type { OtpChallengeRow } from "../types/database.js";
import type { OtpPurpose } from "../types/index.js";

export type CreateOtpChallengeInput = {
  phone: string;
  purpose: OtpPurpose;
  codeHash: string;
  userId?: string | null;
  deviceKey?: string | null;
  payload?: Record<string, unknown>;
  expiresAt: Date;
  maxAttempts: number;
};

export async function invalidateActiveOtpChallenges(
  phone: string,
  purpose: OtpPurpose,
  client?: Queryable
): Promise<void> {
  await query(
    `
      UPDATE otp_challenges
      SET consumed_at = NOW()
      WHERE phone = $1
        AND purpose = $2
        AND consumed_at IS NULL
    `,
    [phone, purpose],
    client
  );
}

export async function createOtpChallenge(
  input: CreateOtpChallengeInput,
  client?: Queryable
): Promise<OtpChallengeRow> {
  await invalidateActiveOtpChallenges(input.phone, input.purpose, client);

  const row = await queryOne<OtpChallengeRow>(
    `
      INSERT INTO otp_challenges (
        phone,
        purpose,
        code_hash,
        user_id,
        device_key,
        payload,
        expires_at,
        max_attempts
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
      RETURNING *
    `,
    [
      input.phone,
      input.purpose,
      input.codeHash,
      input.userId ?? null,
      input.deviceKey ?? null,
      JSON.stringify(input.payload ?? {}),
      input.expiresAt,
      input.maxAttempts,
    ],
    client
  );

  if (!row) {
    throw new Error("Failed to create OTP challenge");
  }

  return row;
}

export async function findActiveOtpChallenge(
  phone: string,
  purpose: OtpPurpose,
  client?: Queryable
): Promise<OtpChallengeRow | null> {
  return queryOne<OtpChallengeRow>(
    `
      SELECT *
      FROM otp_challenges
      WHERE phone = $1
        AND purpose = $2
        AND consumed_at IS NULL
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [phone, purpose],
    client
  );
}

export async function incrementOtpAttempts(
  id: string,
  client?: Queryable
): Promise<OtpChallengeRow | null> {
  return queryOne<OtpChallengeRow>(
    `
      UPDATE otp_challenges
      SET attempt_count = attempt_count + 1
      WHERE id = $1
        AND consumed_at IS NULL
      RETURNING *
    `,
    [id],
    client
  );
}

export async function consumeOtpChallenge(
  id: string,
  client?: Queryable
): Promise<OtpChallengeRow | null> {
  return queryOne<OtpChallengeRow>(
    `
      UPDATE otp_challenges
      SET consumed_at = NOW()
      WHERE id = $1
        AND consumed_at IS NULL
        AND expires_at > NOW()
      RETURNING *
    `,
    [id],
    client
  );
}
