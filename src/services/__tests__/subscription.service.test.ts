import { jest } from "@jest/globals";
import type { SubscriptionWithCategory } from "../subscription.mapper.js";

function baseRow(
  overrides: Partial<SubscriptionWithCategory> = {}
): SubscriptionWithCategory {
  const now = new Date("2026-01-15T12:00:00.000Z");
  return {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: "user-1",
    category_id: null,
    name: "Netflix",
    amount: "15.99",
    currency: "USD",
    billing_cycle: "monthly",
    scale: "micro",
    status: "active",
    next_billing_date: "2026-02-01",
    is_trial: false,
    trial_ends_at: null,
    last_used_at: null,
    unused_days: null,
    provider_key: "netflix",
    color: "#E50914",
    icon: "N",
    cancelled_at: null,
    cancellation_notes: null,
    version: 3,
    created_at: now,
    updated_at: now,
    category_slug: null,
    category_name: null,
    ...overrides,
  };
}

const lockSubscriptionForUser = jest.fn();
const updateSubscriptionForUser = jest.fn();
const createSubscriptionEvent = jest.fn(async () => undefined);
const findCategoryForUser = jest.fn();

await jest.unstable_mockModule("../../db/transaction.js", () => ({
  withTransaction: async <T>(fn: (client: unknown) => Promise<T>) =>
    fn({}),
}));

await jest.unstable_mockModule("../../repositories/subscription.repository.js", () => ({
  createSubscription: jest.fn(),
  findSubscriptionForUser: jest.fn(),
  listActiveForBurnRate: jest.fn(),
  listCalendarForUser: jest.fn(),
  listExpiringTrialsForUser: jest.fn(),
  listSubscriptionsForUser: jest.fn(),
  listTrialEndsForCalendarMonth: jest.fn(),
  listUpcomingForUser: jest.fn(),
  listUnusedForUser: jest.fn(),
  lockSubscriptionForUser,
  updateSubscriptionForUser,
}));

await jest.unstable_mockModule(
  "../../repositories/subscription-event.repository.js",
  () => ({
    createSubscriptionEvent,
  })
);

await jest.unstable_mockModule("../../repositories/category.repository.js", () => ({
  findCategoryForUser,
}));

const { updateUserSubscription } = await import("../subscription.service.js");

describe("updateUserSubscription concurrency", () => {
  beforeEach(() => {
    lockSubscriptionForUser.mockReset();
    updateSubscriptionForUser.mockReset();
    createSubscriptionEvent.mockClear();
    findCategoryForUser.mockReset();
  });

  test("returns 409 when provided version does not match locked row", async () => {
    lockSubscriptionForUser.mockResolvedValue(baseRow({ version: 5 }));

    await expect(
      updateUserSubscription("user-1", baseRow().id, {
        version: 3,
        amount: 20,
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/updated by another request/i),
      details: {
        currentVersion: 5,
        providedVersion: 3,
      },
    });

    expect(updateSubscriptionForUser).not.toHaveBeenCalled();
  });

  test("returns 409 when update row is missing after versioned write", async () => {
    lockSubscriptionForUser.mockResolvedValue(baseRow({ version: 3 }));
    updateSubscriptionForUser.mockResolvedValue(null);

    await expect(
      updateUserSubscription("user-1", baseRow().id, {
        version: 3,
        amount: 20,
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/updated by another request/i),
    });
  });

  test("bumps through a successful versioned update", async () => {
    const locked = baseRow({ version: 3, amount: "15.99" });
    const updated = baseRow({
      version: 4,
      amount: "20",
      updated_at: new Date("2026-01-16T12:00:00.000Z"),
    });

    lockSubscriptionForUser.mockResolvedValue(locked);
    updateSubscriptionForUser.mockResolvedValue(updated);

    const view = await updateUserSubscription("user-1", locked.id, {
      version: 3,
      amount: 20,
    });

    expect(updateSubscriptionForUser).toHaveBeenCalledWith(
      "user-1",
      locked.id,
      expect.objectContaining({
        amount: 20,
        expectedVersion: 3,
      }),
      expect.anything()
    );
    expect(createSubscriptionEvent).toHaveBeenCalled();
    expect(view.version).toBe(4);
    expect(view.amount).toBe(20);
  });

  test("records cancelled event when status moves to cancelled", async () => {
    const locked = baseRow({ version: 2, status: "active" });
    const updated = baseRow({
      version: 3,
      status: "cancelled",
      cancelled_at: new Date("2026-01-16T12:00:00.000Z"),
      cancellation_notes: "Too expensive",
    });

    lockSubscriptionForUser.mockResolvedValue(locked);
    updateSubscriptionForUser.mockResolvedValue(updated);

    await updateUserSubscription("user-1", locked.id, {
      version: 2,
      status: "cancelled",
      cancellationNotes: "Too expensive",
    });

    expect(createSubscriptionEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "cancelled" }),
      expect.anything()
    );
  });
});
