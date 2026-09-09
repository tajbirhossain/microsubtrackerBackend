import type { SubscriptionRow } from "../types/database.js";
import type {
  BillingCycle,
  SpendScale,
  SubscriptionStatus,
} from "../types/index.js";
import { toDateKey } from "../utils/dates.js";

export type SubscriptionCategoryView = {
  id: string;
  slug: string;
  name: string;
};

export type SubscriptionView = {
  id: string;
  name: string;
  amount: number;
  currency: string;
  billingCycle: BillingCycle;
  category: SubscriptionCategoryView | null;
  scale: SpendScale;
  status: SubscriptionStatus;
  nextBillingDate: string | null;
  isTrial: boolean;
  trialEndsAt: string | null;
  lastUsedAt: string | null;
  unusedDays: number | null;
  providerKey: string | null;
  color: string | null;
  icon: string | null;
  cancelledAt: string | null;
  cancellationNotes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type SubscriptionWithCategory = SubscriptionRow & {
  category_slug: string | null;
  category_name: string | null;
};

export function toSubscriptionView(
  row: SubscriptionWithCategory
): SubscriptionView {
  return {
    id: row.id,
    name: row.name,
    amount: Number(row.amount),
    currency: row.currency,
    billingCycle: row.billing_cycle,
    category:
      row.category_id && row.category_slug && row.category_name
        ? {
            id: row.category_id,
            slug: row.category_slug,
            name: row.category_name,
          }
        : null,
    scale: row.scale,
    status: row.status,
    nextBillingDate: toDateKey(row.next_billing_date),
    isTrial: row.is_trial,
    trialEndsAt: toDateKey(row.trial_ends_at),
    lastUsedAt: row.last_used_at ? row.last_used_at.toISOString() : null,
    unusedDays: row.unused_days,
    providerKey: row.provider_key,
    color: row.color,
    icon: row.icon,
    cancelledAt: row.cancelled_at ? row.cancelled_at.toISOString() : null,
    cancellationNotes: row.cancellation_notes,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
