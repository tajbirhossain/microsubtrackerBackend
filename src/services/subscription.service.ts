import { buildPaginatedResult, parsePagination } from "../db/pagination.js";
import { withTransaction } from "../db/transaction.js";
import { findCategoryForUser } from "../repositories/category.repository.js";
import { createSubscriptionEvent } from "../repositories/subscription-event.repository.js";
import {
  createSubscription,
  findSubscriptionForUser,
  listActiveForBurnRate,
  listCalendarForUser,
  listExpiringTrialsForUser,
  listSubscriptionsForUser,
  listTrialEndsForCalendarMonth,
  listUpcomingForUser,
  listUnusedForUser,
  lockSubscriptionForUser,
  updateSubscriptionForUser,
} from "../repositories/subscription.repository.js";
import type {
  CreateSubscriptionInput,
  ListSubscriptionsQuery,
  UpdateSubscriptionInput,
} from "../schemas/subscription.schemas.js";
import type { PaginatedResult } from "../types/index.js";
import { daysUntil, liveUnusedDays } from "../utils/dates.js";
import { AppError } from "../utils/errors.js";
import { assertFound } from "../security/ownership.js";
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

export type UpcomingItem = SubscriptionView & { daysUntil: number };
export type UnusedItem = SubscriptionView & {
  unusedDays: number;
  quietMonthly: number;
};
export type ExpiringTrialItem = SubscriptionView & { daysLeft: number };

export type CalendarDay = {
  date: string;
  renewals: SubscriptionView[];
  trialEnds: SubscriptionView[];
};

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
  const row = assertFound(
    await findSubscriptionForUser(userId, subscriptionId),
    "Subscription not found"
  );
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
): Promise<{
  days: number;
  count: number;
  monthlyTotal: number;
  currency: string;
  items: UpcomingItem[];
}> {
  const rows = await listUpcomingForUser(userId, days);
  const items: UpcomingItem[] = rows.map((row) => {
    const view = toSubscriptionView(row);
    return {
      ...view,
      daysUntil: daysUntil(view.nextBillingDate) ?? 0,
    };
  });

  const monthlyTotal = items.reduce(
    (sum, item) => sum + toMonthlyAmount(item.amount, item.billingCycle),
    0
  );

  return {
    days,
    count: items.length,
    monthlyTotal: roundMoney(monthlyTotal),
    currency: items[0]?.currency ?? "USD",
    items,
  };
}

export async function getCalendarSubscriptions(
  userId: string,
  year: number,
  month: number
): Promise<{
  year: number;
  month: number;
  renewalCount: number;
  trialEndCount: number;
  days: CalendarDay[];
}> {
  const [renewalRows, trialRows] = await Promise.all([
    listCalendarForUser(userId, year, month),
    listTrialEndsForCalendarMonth(userId, year, month),
  ]);

  const byDate = new Map<string, CalendarDay>();

  const ensureDay = (date: string): CalendarDay => {
    const existing = byDate.get(date);
    if (existing) return existing;
    const created: CalendarDay = { date, renewals: [], trialEnds: [] };
    byDate.set(date, created);
    return created;
  };

  for (const row of renewalRows) {
    if (!row.next_billing_date) continue;
    ensureDay(row.next_billing_date).renewals.push(toSubscriptionView(row));
  }

  for (const row of trialRows) {
    if (!row.trial_ends_at) continue;
    ensureDay(row.trial_ends_at).trialEnds.push(toSubscriptionView(row));
  }

  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  return {
    year,
    month,
    renewalCount: renewalRows.length,
    trialEndCount: trialRows.length,
    days,
  };
}

export async function getUnusedSubscriptions(
  userId: string,
  minDays: number
): Promise<{
  minDays: number;
  count: number;
  quietMonthlyTotal: number;
  currency: string;
  items: UnusedItem[];
}> {
  const rows = await listUnusedForUser(userId, minDays);
  const items: UnusedItem[] = rows.map((row) => {
    const view = toSubscriptionView(row);
    const unused = liveUnusedDays(view.lastUsedAt, view.createdAt);
    return {
      ...view,
      unusedDays: unused,
      quietMonthly: roundMoney(toMonthlyAmount(view.amount, view.billingCycle)),
    };
  });

  const quietMonthlyTotal = items.reduce((sum, item) => sum + item.quietMonthly, 0);

  return {
    minDays,
    count: items.length,
    quietMonthlyTotal: roundMoney(quietMonthlyTotal),
    currency: items[0]?.currency ?? "USD",
    items,
  };
}

export async function getExpiringTrials(
  userId: string,
  days: number
): Promise<{
  days: number;
  count: number;
  items: ExpiringTrialItem[];
}> {
  const rows = await listExpiringTrialsForUser(userId, days);
  const items: ExpiringTrialItem[] = rows.map((row) => {
    const view = toSubscriptionView(row);
    return {
      ...view,
      daysLeft: daysUntil(view.trialEndsAt) ?? 0,
    };
  });

  return {
    days,
    count: items.length,
    items,
  };
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
  unused: {
    count: number;
    monthlyWaste: number;
    minDays: number;
  };
  trials: {
    activeCount: number;
    expiringSoonCount: number;
    windowDays: number;
  };
  upcoming: {
    count: number;
    windowDays: number;
    monthlyTotal: number;
  };
}> {
  const UNUSED_MIN_DAYS = 30;
  const TRIAL_WINDOW_DAYS = 14;
  const UPCOMING_WINDOW_DAYS = 30;

  const [rows, unusedRows, trialRows, upcomingRows] = await Promise.all([
    listActiveForBurnRate(userId),
    listUnusedForUser(userId, UNUSED_MIN_DAYS),
    listExpiringTrialsForUser(userId, TRIAL_WINDOW_DAYS),
    listUpcomingForUser(userId, UPCOMING_WINDOW_DAYS),
  ]);

  const items = rows.map(toSubscriptionView);

  let monthlyTotal = 0;
  let yearlyTotal = 0;
  let activeTrialCount = 0;
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

    if (item.isTrial) {
      activeTrialCount += 1;
    }

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

  const unusedMonthlyWaste = unusedRows.reduce((sum, row) => {
    const view = toSubscriptionView(row);
    return sum + toMonthlyAmount(view.amount, view.billingCycle);
  }, 0);

  const upcomingMonthly = upcomingRows.reduce((sum, row) => {
    const view = toSubscriptionView(row);
    return sum + toMonthlyAmount(view.amount, view.billingCycle);
  }, 0);

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
    unused: {
      count: unusedRows.length,
      monthlyWaste: roundMoney(unusedMonthlyWaste),
      minDays: UNUSED_MIN_DAYS,
    },
    trials: {
      activeCount: activeTrialCount,
      expiringSoonCount: trialRows.length,
      windowDays: TRIAL_WINDOW_DAYS,
    },
    upcoming: {
      count: upcomingRows.length,
      windowDays: UPCOMING_WINDOW_DAYS,
      monthlyTotal: roundMoney(upcomingMonthly),
    },
  };
}
