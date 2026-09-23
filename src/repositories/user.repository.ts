import type { Queryable } from "../db/query.js";
import { query, queryOne } from "../db/query.js";
import type { UserRow } from "../types/database.js";

export type CreateUserInput = {
  email: string;
  passwordHash: string;
  displayName?: string;
  preferredCurrency?: string;
  emailVerified?: boolean;
};

export async function findActiveUserByEmail(
  email: string,
  client?: Queryable
): Promise<UserRow | null> {
  return queryOne<UserRow>(
    `
      SELECT *
      FROM users
      WHERE LOWER(email) = LOWER($1)
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [email],
    client
  );
}

export async function findActiveUserById(
  id: string,
  client?: Queryable
): Promise<UserRow | null> {
  return queryOne<UserRow>(
    `
      SELECT *
      FROM users
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [id],
    client
  );
}

export async function createUser(
  input: CreateUserInput,
  client?: Queryable
): Promise<UserRow> {
  const user = await queryOne<UserRow>(
    `
      INSERT INTO users (
        email,
        password_hash,
        display_name,
        preferred_currency,
        email_verified_at
      )
      VALUES (
        LOWER($1),
        $2,
        $3,
        COALESCE($4, 'USD'),
        CASE WHEN $5 THEN NOW() ELSE NULL END
      )
      RETURNING *
    `,
    [
      input.email,
      input.passwordHash,
      input.displayName ?? null,
      input.preferredCurrency ?? null,
      input.emailVerified ?? true,
    ],
    client
  );

  if (!user) {
    throw new Error("Failed to create user");
  }

  return user;
}

export async function updatePasswordHash(
  userId: string,
  passwordHash: string,
  client?: Queryable
): Promise<void> {
  await query(
    `
      UPDATE users
      SET password_hash = $2
      WHERE id = $1
        AND deleted_at IS NULL
    `,
    [userId, passwordHash],
    client
  );
}

export async function updateDisplayName(
  userId: string,
  displayName: string,
  client?: Queryable
): Promise<UserRow | null> {
  return queryOne<UserRow>(
    `
      UPDATE users
      SET display_name = $2
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING *
    `,
    [userId, displayName],
    client
  );
}

export async function softDeleteUser(
  userId: string,
  client?: Queryable
): Promise<UserRow | null> {
  return queryOne<UserRow>(
    `
      UPDATE users
      SET deleted_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING *
    `,
    [userId],
    client
  );
}

export type BillingEntitlementInput = {
  planTier: "plus" | "pro" | null;
  planStatus: "none" | "active" | "past_due" | "canceled";
  paddleCustomerId?: string | null;
  paddleSubscriptionId?: string | null;
};

export async function updateBillingEntitlement(
  userId: string,
  input: BillingEntitlementInput,
  client?: Queryable
): Promise<UserRow | null> {
  return queryOne<UserRow>(
    `
      UPDATE users
      SET
        plan_tier = $2,
        plan_status = $3,
        paddle_customer_id = COALESCE($4, paddle_customer_id),
        paddle_subscription_id = COALESCE($5, paddle_subscription_id),
        plan_updated_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING *
    `,
    [
      userId,
      input.planTier,
      input.planStatus,
      input.paddleCustomerId ?? null,
      input.paddleSubscriptionId ?? null,
    ],
    client
  );
}

export async function findActiveUserByPaddleCustomerId(
  paddleCustomerId: string,
  client?: Queryable
): Promise<UserRow | null> {
  return queryOne<UserRow>(
    `
      SELECT *
      FROM users
      WHERE paddle_customer_id = $1
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [paddleCustomerId],
    client
  );
}

export async function findActiveUserByPaddleSubscriptionId(
  paddleSubscriptionId: string,
  client?: Queryable
): Promise<UserRow | null> {
  return queryOne<UserRow>(
    `
      SELECT *
      FROM users
      WHERE paddle_subscription_id = $1
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [paddleSubscriptionId],
    client
  );
}
