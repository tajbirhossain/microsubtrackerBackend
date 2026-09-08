import type { Queryable } from "../db/query.js";
import { query, queryOne } from "../db/query.js";
import type { RefreshTokenRow } from "../types/database.js";

export async function createRefreshToken(
  input: {
    userId: string;
    deviceId: string | null;
    tokenHash: string;
    expiresAt: Date;
  },
  client?: Queryable
): Promise<RefreshTokenRow> {
  const row = await queryOne<RefreshTokenRow>(
    `
      INSERT INTO refresh_tokens (user_id, device_id, token_hash, expires_at)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
    [input.userId, input.deviceId, input.tokenHash, input.expiresAt],
    client
  );

  if (!row) {
    throw new Error("Failed to create refresh token");
  }

  return row;
}

export async function findActiveRefreshTokenByHash(
  tokenHash: string,
  client?: Queryable
): Promise<RefreshTokenRow | null> {
  return queryOne<RefreshTokenRow>(
    `
      SELECT *
      FROM refresh_tokens
      WHERE token_hash = $1
        AND revoked_at IS NULL
        AND expires_at > NOW()
      LIMIT 1
    `,
    [tokenHash],
    client
  );
}

export async function revokeRefreshTokenById(
  id: string,
  client?: Queryable
): Promise<void> {
  await query(
    `
      UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE id = $1
        AND revoked_at IS NULL
    `,
    [id],
    client
  );
}

export async function revokeRefreshTokensForUser(
  userId: string,
  client?: Queryable
): Promise<void> {
  await query(
    `
      UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE user_id = $1
        AND revoked_at IS NULL
    `,
    [userId],
    client
  );
}

export async function revokeRefreshTokensForDevice(
  userId: string,
  deviceId: string,
  client?: Queryable
): Promise<void> {
  await query(
    `
      UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE user_id = $1
        AND device_id = $2
        AND revoked_at IS NULL
    `,
    [userId, deviceId],
    client
  );
}
