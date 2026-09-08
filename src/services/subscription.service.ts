import { buildPaginatedResult, parsePagination } from "../db/pagination.js";
import { withTransaction } from "../db/transaction.js";
import { findCategoryForUser } from "../repositories/category.repository.js";
import { createSubscriptionEvent } from "../repositories/subscription-event.repository.js";
import {
  createSubscription,
  findSubscriptionForUser,
  listActiveForBurnRate,
  listCalendarForUser,
  listSubscriptionsForUser,
  listUpcomingForUser,
  lockSubscriptionForUser,
  updateSubscriptionForUser,
} from "../repositories/subscription.repository.js";
import type {
  CreateSubscriptionInput,
  ListSubscriptionsQuery,
  UpdateSubscriptionInput,
} from "../schemas/subscription.schemas.js";
import type { PaginatedResult } from "../types/index.js";
import { AppError } from "../utils/errors.js";
import {
  roundMoney,
  scaleForAmount,
  toMonthlyAmount,
  toYearlyAmount,
} from "../utils/money.js";
import {
  toSubscriptionView,
  type SubscriptionView,
} from "./subscription.mapper.js";

async function resolveCategoryId(
  userId: string,
  input: {
    categoryId?: string | null;
    categorySlug?: string | null;
  }
): Promise<string | null | undefined> {
  if (input.categoryId === null || input.categorySlug === null) {
    return null;
  }

  if (input.categoryId === undefined && input.categorySlug === undefined) {
    return undefined;
  }

  const category = await findCategoryForUser({
    userId,
    id: input.categoryId ?? undefined,
    slug: input.categorySlug ?? undefined,
  });

  if (!category) {
    throw new AppError(400, "Category not found");
  }

  return category.id;
}

function normalizeTrialFields(input: {
  isTrial?: boolean;
  trialEndsAt?: string | null;
}): { isTrial: boolean; trialEndsAt: string | null } | null {
  if (input.isTrial === undefined && input.trialEndsAt === undefined) {
    return null;
  }

  const isTrial = input.isTrial ?? Boolean(input.trialEndsAt);
  const trialEndsAt = isTrial ? (input.trialEndsAt ?? null) : null;

  if (isTrial && !trialEndsAt) {
    throw new AppError(400, "trialEndsAt is required when isTrial is true");
  }

  return { isTrial, trialEndsAt };
}

export async function createUserSubscription(
  userId: string,
  input: CreateSubscriptionInput
): Promise<SubscriptionView> {
  const categoryId =
    (await resolveCategoryId(userId, {
      categoryId: input.categoryId,
      categorySlug: input.categorySlug,
    })) ?? null;

  const scale =
    input.scale ?? scaleForAmount(input.amount, input.billingCycle);

  const status = input.status ?? "active";
  const cancelledAt = status === "cancelled" ? new Date() : null;

  return withTransaction(async (client) => {
    const created = await createSubscription(
      {
        userId,
        categoryId,
        name: input.name,
        amount: input.amount,
        currency: input.currency,
        billingCycle: input.billingCycle,
        scale,
        status,
        nextBillingDate: input.nextBillingDate ?? null,
        isTrial: input.isTrial,
        trialEndsAt: input.isTrial ? (input.trialEndsAt ?? null) : null,
        providerKey: input.providerKey ?? null,
        color: input.color ?? null,
        icon: input.icon ?? null,
        cancelledAt,
        cancellationNotes: input.cancellationNotes ?? null,
      },
      client
    );

    await createSubscriptionEvent(
      {
        subscriptionId: created.id,
        userId,
        eventType: "created",
        payload: { name: created.name, amount: created.amount },
      },
      client
    );

    if (created.is_trial) {
      await createSubscriptionEvent(
        {
          subscriptionId: created.id,
          userId,
          eventType: "trial_started",
          payload: { trialEndsAt: created.trial_ends_at },
        },
        client
      );
    }

    return toSubscriptionView(created);
  });
}

export async function listUserSubscriptions(
  userId: string,
  query: ListSubscriptionsQuery
): Promise<PaginatedResult<SubscriptionView>> {
  const pagination = parsePagination(query);
  const { rows, total } = await listSubscriptionsForUser(
    {
      userId,
      status: query.status,
      billingCycle: query.billingCycle,
      categorySlug: query.categorySlug,
      search: query.search,
    },
    pagination
  );

  return buildPaginatedResult(rows.map(toSubscriptionView), total, pagination);
}

export async function getUserSubscription(
  userId: string,
  subscriptionId: string
): Promise<SubscriptionView> {
  const row = await findSubscriptionForUser(userId, subscriptionId);
  if (!row) {
    throw new AppError(404, "Subscription not found");
  }
  return toSubscriptionView(row);
}

export async function updateUserSubscription(
  userId: string,
  subscriptionId: string,
  input: UpdateSubscriptionInput
): Promise<SubscriptionView> {
  const categoryId = await resolveCategoryId(userId, {
    categoryId: input.categoryId,
    categorySlug: input.categorySlug,
  });

  const updated = await withTransaction(async (client) => {
    const existing = await lockSubscriptionForUser(
      userId,
      subscriptionId,
      client
    );
    if (!existing) {
      throw new AppError(404, "Subscription not found");
    }

    if (existing.version !== input.version) {
      throw new AppError(409, "Subscription was updated by another request", {
        currentVersion: existing.version,
        providedVersion: input.version,
      });
    }

    const nextAmount =
      input.amount !== undefined ? input.amount : Number(existing.amount);
    const nextCycle = input.billingCycle ?? existing.billing_cycle;
    const scale =
      input.scale ??
      (input.amount !== undefined || input.billingCycle !== undefined
        ? scaleForAmount(nextAmount, nextCycle)
        : undefined);

    const trial = normalizeTrialFields({
      isTrial: input.isTrial,
      trialEndsAt: input.trialEndsAt,
    });

    let cancelledAt: Date | null | undefined;
    let cancellationNotes = input.cancellationNotes;

    if (input.status === "cancelled" && existing.status !== "cancelled") {
      cancelledAt = new Date();
    } else if (
      input.status !== undefined &&
      input.status !== "cancelled" &&
      existing.status === "cancelled"
    ) {
      cancelledAt = null;
      if (cancellationNotes === undefined) {
        cancellationNotes = null;
      }
    }

    const row = await updateSubscriptionForUser(
      userId,
      subscriptionId,
      {
        categoryId,
        name: input.name,
        amount: input.amount,
        currency: input.currency,
        billingCycle: input.billingCycle,
        scale,
        status: input.status,
        nextBillingDate: input.nextBillingDate,
        isTrial: trial?.isTrial,
        trialEndsAt: trial?.trialEndsAt,
        providerKey: input.providerKey,
        color: input.color,
        icon: input.icon,
        cancelledAt,
        cancellationNotes,
        expectedVersion: input.version,
      },
      client
    );

    if (!row) {
      throw new AppError(409, "Subscription was updated by another request", {
        currentVersion: existing.version,
        providedVersion: input.version,
      });
    }

    const eventType =
      input.status === "cancelled" && existing.status !== "cancelled"
        ? "cancelled"
        : input.status !== undefined &&
            input.status !== "cancelled" &&
            existing.status === "cancelled"
          ? "reactivated"
          : "updated";

    await createSubscriptionEvent(
      {
        subscriptionId: row.id,
        userId,
        eventType,
        payload: input,
      },
      client
    );

    if (categoryId !== undefined && categoryId !== existing.category_id) {
      await createSubscriptionEvent(
        {
          subscriptionId: row.id,
          userId,
          eventType: "category_changed",
          payload: {
            from: existing.category_id,
            to: categoryId,
          },
        },
        client
      );
    }

    return row;
  });

  return toSubscriptionView(updated);
}

export async function deleteUserSubscription(
  userId: string,
  subscriptionId: string,
  notes: string | undefined,
  version: number
): Promise<SubscriptionView> {
  return updateUserSubscription(userId, subscriptionId, {
    status: "cancelled",
    cancellationNotes: notes,
    isTrial: false,
    trialEndsAt: null,
    version,
  });
}

export async function getUpcomingSubscriptions(
  userId: string,
  days: number
): Promise<{ days: number; items: SubscriptionView[] }> {
  const rows = await listUpcomingForUser(userId, days);
  return {
    days,
    items: rows.map(toSubscriptionView),
  };
}

export async function getCalendarSubscriptions(
  userId: string,
  year: number,
  month: number
): Promise<{
  year: number;
  month: number;
  days: Array<{ date: string; items: SubscriptionView[] }>;
}> {
  const rows = await listCalendarForUser(userId, year, month);
  const grouped = new Map<string, SubscriptionView[]>();

  for (const row of rows) {
    const date = row.next_billing_date;
    if (!date) continue;
    const list = grouped.get(date) ?? [];
    list.push(toSubscriptionView(row));
    grouped.set(date, list);
  }

  const days = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({ date, items }));

  return { year, month, days };
}

export async function getBurnRate(
  userId: string
): Promise<{
  currency: string;
  monthlyTotal: number;
  yearlyTotal: number;
  activeCount: number;
  byCategory: Array<{
    category: string;
    monthlyTotal: number;
    yearlyTotal: number;
    count: number;
  }>;
  byScale: {
    micro: { monthlyTotal: number; count: number };
    macro: { monthlyTotal: number; count: number };
  };
}> {
  const rows = await listActiveForBurnRate(userId);
  const items = rows.map(toSubscriptionView);

  let monthlyTotal = 0;
  let yearlyTotal = 0;
  const categoryMap = new Map<
    string,
    { monthlyTotal: number; yearlyTotal: number; count: number }
  >();
  const byScale = {
    micro: { monthlyTotal: 0, count: 0 },
    macro: { monthlyTotal: 0, count: 0 },
  };

  for (const item of items) {
    const monthly = toMonthlyAmount(item.amount, item.billingCycle);
    const yearly = toYearlyAmount(item.amount, item.billingCycle);
    monthlyTotal += monthly;
    yearlyTotal += yearly;

    const categoryName = item.category?.name ?? "Uncategorized";
    const bucket = categoryMap.get(categoryName) ?? {
      monthlyTotal: 0,
      yearlyTotal: 0,
      count: 0,
    };
    bucket.monthlyTotal += monthly;
    bucket.yearlyTotal += yearly;
    bucket.count += 1;
    categoryMap.set(categoryName, bucket);

    byScale[item.scale].monthlyTotal += monthly;
    byScale[item.scale].count += 1;
  }

  const dominantCurrency = items[0]?.currency ?? "USD";

  return {
    currency: dominantCurrency,
    monthlyTotal: roundMoney(monthlyTotal),
    yearlyTotal: roundMoney(yearlyTotal),
    activeCount: items.length,
    byCategory: [...categoryMap.entries()]
      .map(([category, stats]) => ({
        category,
        monthlyTotal: roundMoney(stats.monthlyTotal),
        yearlyTotal: roundMoney(stats.yearlyTotal),
        count: stats.count,
      }))
      .sort((a, b) => b.monthlyTotal - a.monthlyTotal),
    byScale: {
      micro: {
        monthlyTotal: roundMoney(byScale.micro.monthlyTotal),
        count: byScale.micro.count,
      },
      macro: {
        monthlyTotal: roundMoney(byScale.macro.monthlyTotal),
        count: byScale.macro.count,
      },
    },
  };
}
