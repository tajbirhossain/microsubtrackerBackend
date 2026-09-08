import type { Queryable } from "../db/query.js";
import { query, queryOne } from "../db/query.js";
import type { PaginationParams } from "../types/index.js";
import type { SubscriptionWithCategory } from "../services/subscription.mapper.js";
import type {
  BillingCycle,
  SpendScale,
  SubscriptionStatus,
} from "../types/index.js";

const SELECT_WITH_CATEGORY = `
  SELECT
    s.*,
    c.slug AS category_slug,
    c.name AS category_name
  FROM subscriptions s
  LEFT JOIN categories c ON c.id = s.category_id
`;

export type CreateSubscriptionRowInput = {
  userId: string;
  categoryId: string | null;
  name: string;
  amount: number;
  currency: string;
  billingCycle: BillingCycle;
  scale: SpendScale;
  status: SubscriptionStatus;
  nextBillingDate: string | null;
  isTrial: boolean;
  trialEndsAt: string | null;
  providerKey: string | null;
  color: string | null;
  icon: string | null;
  cancelledAt: Date | null;
  cancellationNotes: string | null;
};

export type UpdateSubscriptionRowInput = {
  categoryId?: string | null;
  name?: string;
  amount?: number;
  currency?: string;
  billingCycle?: BillingCycle;
  scale?: SpendScale;
  status?: SubscriptionStatus;
  nextBillingDate?: string | null;
  isTrial?: boolean;
  trialEndsAt?: string | null;
  providerKey?: string | null;
  color?: string | null;
  icon?: string | null;
  cancelledAt?: Date | null;
  cancellationNotes?: string | null;
  expectedVersion?: number;
};

export type ListSubscriptionsFilter = {
  userId: string;
  status?: SubscriptionStatus;
  billingCycle?: BillingCycle;
  categorySlug?: string;
  search?: string;
};

export async function createSubscription(
  input: CreateSubscriptionRowInput,
  client?: Queryable
): Promise<SubscriptionWithCategory> {
  const row = await queryOne<SubscriptionWithCategory>(
    `
      WITH created AS (
        INSERT INTO subscriptions (
          user_id,
          category_id,
          name,
          amount,
          currency,
          billing_cycle,
          scale,
          status,
          next_billing_date,
          is_trial,
          trial_ends_at,
          provider_key,
          color,
          icon,
          cancelled_at,
          cancellation_notes
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
        )
        RETURNING *
      )
      SELECT
        created.*,
        c.slug AS category_slug,
        c.name AS category_name
      FROM created
      LEFT JOIN categories c ON c.id = created.category_id
    `,
    [
      input.userId,
      input.categoryId,
      input.name,
      input.amount,
      input.currency,
      input.billingCycle,
      input.scale,
      input.status,
      input.nextBillingDate,
      input.isTrial,
      input.trialEndsAt,
      input.providerKey,
      input.color,
      input.icon,
      input.cancelledAt,
      input.cancellationNotes,
    ],
    client
  );

  if (!row) {
    throw new Error("Failed to create subscription");
  }

  return row;
}

export async function findSubscriptionForUser(
  userId: string,
  subscriptionId: string,
  client?: Queryable
): Promise<SubscriptionWithCategory | null> {
  return queryOne<SubscriptionWithCategory>(
    `
      ${SELECT_WITH_CATEGORY}
      WHERE s.id = $1
        AND s.user_id = $2
      LIMIT 1
    `,
    [subscriptionId, userId],
    client
  );
}

export async function lockSubscriptionForUser(
  userId: string,
  subscriptionId: string,
  client: Queryable
): Promise<SubscriptionWithCategory | null> {
  return queryOne<SubscriptionWithCategory>(
    `
      ${SELECT_WITH_CATEGORY}
      WHERE s.id = $1
        AND s.user_id = $2
      FOR UPDATE OF s
    `,
    [subscriptionId, userId],
    client
  );
}

export async function listSubscriptionsForUser(
  filter: ListSubscriptionsFilter,
  pagination: PaginationParams,
  client?: Queryable
): Promise<{ rows: SubscriptionWithCategory[]; total: number }> {
  const where: string[] = ["s.user_id = $1"];
  const params: unknown[] = [filter.userId];

  if (filter.status) {
    params.push(filter.status);
    where.push(`s.status = $${params.length}`);
  }

  if (filter.billingCycle) {
    params.push(filter.billingCycle);
    where.push(`s.billing_cycle = $${params.length}`);
  }

  if (filter.categorySlug) {
    params.push(filter.categorySlug);
    where.push(`c.slug = $${params.length}`);
  }

  if (filter.search) {
    params.push(`%${filter.search.toLowerCase()}%`);
    where.push(`LOWER(s.name) LIKE $${params.length}`);
  }

  const whereSql = where.join(" AND ");

  const countResult = await queryOne<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM subscriptions s
      LEFT JOIN categories c ON c.id = s.category_id
      WHERE ${whereSql}
    `,
    params,
    client
  );

  params.push(pagination.limit, pagination.offset);
  const listResult = await query<SubscriptionWithCategory>(
    `
      ${SELECT_WITH_CATEGORY}
      WHERE ${whereSql}
      ORDER BY
        CASE WHEN s.status = 'active' THEN 0 ELSE 1 END,
        s.next_billing_date ASC NULLS LAST,
        s.created_at DESC
      LIMIT $${params.length - 1}
      OFFSET $${params.length}
    `,
    params,
    client
  );

  return {
    rows: listResult.rows,
    total: Number(countResult?.count ?? 0),
  };
}

export async function updateSubscriptionForUser(
  userId: string,
  subscriptionId: string,
  input: UpdateSubscriptionRowInput,
  client?: Queryable
): Promise<SubscriptionWithCategory | null> {
  const sets: string[] = [];
  const params: unknown[] = [];

  const add = (column: string, value: unknown) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };

  if (input.categoryId !== undefined) add("category_id", input.categoryId);
  if (input.name !== undefined) add("name", input.name);
  if (input.amount !== undefined) add("amount", input.amount);
  if (input.currency !== undefined) add("currency", input.currency);
  if (input.billingCycle !== undefined) add("billing_cycle", input.billingCycle);
  if (input.scale !== undefined) add("scale", input.scale);
  if (input.status !== undefined) add("status", input.status);
  if (input.nextBillingDate !== undefined) {
    add("next_billing_date", input.nextBillingDate);
  }
  if (input.isTrial !== undefined) add("is_trial", input.isTrial);
  if (input.trialEndsAt !== undefined) add("trial_ends_at", input.trialEndsAt);
  if (input.providerKey !== undefined) add("provider_key", input.providerKey);
  if (input.color !== undefined) add("color", input.color);
  if (input.icon !== undefined) add("icon", input.icon);
  if (input.cancelledAt !== undefined) add("cancelled_at", input.cancelledAt);
  if (input.cancellationNotes !== undefined) {
    add("cancellation_notes", input.cancellationNotes);
  }

  sets.push("version = version + 1");

  params.push(subscriptionId, userId);
  const idParam = params.length - 1;
  const userParam = params.length;

  let versionClause = "";
  if (input.expectedVersion !== undefined) {
    params.push(input.expectedVersion);
    versionClause = ` AND version = $${params.length}`;
  }

  return queryOne<SubscriptionWithCategory>(
    `
      WITH updated AS (
        UPDATE subscriptions
        SET ${sets.join(", ")}
        WHERE id = $${idParam}
          AND user_id = $${userParam}
          ${versionClause}
        RETURNING *
      )
      SELECT
        updated.*,
        c.slug AS category_slug,
        c.name AS category_name
      FROM updated
      LEFT JOIN categories c ON c.id = updated.category_id
    `,
    params,
    client
  );
}

export async function listUpcomingForUser(
  userId: string,
  days: number,
  client?: Queryable
): Promise<SubscriptionWithCategory[]> {
  const result = await query<SubscriptionWithCategory>(
    `
      ${SELECT_WITH_CATEGORY}
      WHERE s.user_id = $1
        AND s.status = 'active'
        AND s.next_billing_date IS NOT NULL
        AND s.next_billing_date <= (CURRENT_DATE + ($2::text || ' days')::interval)::date
        AND s.next_billing_date >= CURRENT_DATE
      ORDER BY s.next_billing_date ASC, s.name ASC
    `,
    [userId, days],
    client
  );
  return result.rows;
}

export async function listCalendarForUser(
  userId: string,
  year: number,
  month: number,
  client?: Queryable
): Promise<SubscriptionWithCategory[]> {
  const result = await query<SubscriptionWithCategory>(
    `
      ${SELECT_WITH_CATEGORY}
      WHERE s.user_id = $1
        AND s.status IN ('active', 'paused')
        AND s.next_billing_date IS NOT NULL
        AND EXTRACT(YEAR FROM s.next_billing_date) = $2
        AND EXTRACT(MONTH FROM s.next_billing_date) = $3
      ORDER BY s.next_billing_date ASC, s.name ASC
    `,
    [userId, year, month],
    client
  );
  return result.rows;
}

export async function listActiveForBurnRate(
  userId: string,
  client?: Queryable
): Promise<SubscriptionWithCategory[]> {
  const result = await query<SubscriptionWithCategory>(
    `
      ${SELECT_WITH_CATEGORY}
      WHERE s.user_id = $1
        AND s.status = 'active'
      ORDER BY s.name ASC
    `,
    [userId],
    client
  );
  return result.rows;
}

/** Active subs quiet for at least `minDays` (computed live from last_used_at / created_at). */
export async function listUnusedForUser(
  userId: string,
  minDays: number,
  client?: Queryable
): Promise<SubscriptionWithCategory[]> {
  const result = await query<SubscriptionWithCategory>(
    `
      ${SELECT_WITH_CATEGORY}
      WHERE s.user_id = $1
        AND s.status = 'active'
        AND GREATEST(
          0,
          (CURRENT_DATE - COALESCE(s.last_used_at::date, s.created_at::date))
        ) >= $2
      ORDER BY
        GREATEST(
          0,
          (CURRENT_DATE - COALESCE(s.last_used_at::date, s.created_at::date))
        ) DESC,
        s.name ASC
    `,
    [userId, minDays],
    client
  );
  return result.rows;
}

/** Active trials ending within the next `days` (inclusive of today). */
export async function listExpiringTrialsForUser(
  userId: string,
  days: number,
  client?: Queryable
): Promise<SubscriptionWithCategory[]> {
  const result = await query<SubscriptionWithCategory>(
    `
      ${SELECT_WITH_CATEGORY}
      WHERE s.user_id = $1
        AND s.status = 'active'
        AND s.is_trial = TRUE
        AND s.trial_ends_at IS NOT NULL
        AND s.trial_ends_at >= CURRENT_DATE
        AND s.trial_ends_at <= (CURRENT_DATE + ($2::text || ' days')::interval)::date
      ORDER BY s.trial_ends_at ASC, s.name ASC
    `,
    [userId, days],
    client
  );
  return result.rows;
}

/** Active trials whose trial_ends_at falls in a given calendar month. */
export async function listTrialEndsForCalendarMonth(
  userId: string,
  year: number,
  month: number,
  client?: Queryable
): Promise<SubscriptionWithCategory[]> {
  const result = await query<SubscriptionWithCategory>(
    `
      ${SELECT_WITH_CATEGORY}
      WHERE s.user_id = $1
        AND s.status IN ('active', 'paused')
        AND s.is_trial = TRUE
        AND s.trial_ends_at IS NOT NULL
        AND EXTRACT(YEAR FROM s.trial_ends_at) = $2
        AND EXTRACT(MONTH FROM s.trial_ends_at) = $3
      ORDER BY s.trial_ends_at ASC, s.name ASC
    `,
    [userId, year, month],
    client
  );
  return result.rows;
}
