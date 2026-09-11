import { jest } from "@jest/globals";
import request from "supertest";
import { AppError } from "../utils/errors.js";

type StoredValue = string;

function createFakeRedis() {
  const store = new Map<string, StoredValue>();
  const counters = new Map<string, number>();

  return {
    store,
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async set(
      key: string,
      value: string,
      ...args: Array<string | number>
    ): Promise<"OK" | null> {
      if (args.includes("NX") && store.has(key)) return null;
      store.set(key, value);
      return "OK";
    },
    async del(key: string) {
      return store.delete(key) ? 1 : 0;
    },
    async incr(key: string) {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    },
    async incrby(key: string, by: number) {
      const next = (counters.get(key) ?? 0) + by;
      counters.set(key, next);
      return next;
    },
    async expire() {
      return 1;
    },
    async ping() {
      return "PONG";
    },
    on() {
      return this;
    },
    status: "ready",
    async quit() {
      return "OK";
    },
  };
}

const fakeRedis = createFakeRedis();

const testUser = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  phone: null,
  email: "tester@example.com",
  password_hash: "hash",
  display_name: "Tester",
  preferred_currency: "USD",
  email_verified_at: new Date("2026-01-01T00:00:00.000Z"),
  deleted_at: null,
  created_at: new Date("2026-01-01T00:00:00.000Z"),
  updated_at: new Date("2026-01-01T00:00:00.000Z"),
};

const createdSubscription = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "Netflix",
  amount: 15.99,
  currency: "USD",
  billingCycle: "monthly" as const,
  category: null,
  scale: "micro" as const,
  status: "active" as const,
  nextBillingDate: "2026-02-01",
  isTrial: false,
  trialEndsAt: null,
  lastUsedAt: null,
  unusedDays: null,
  providerKey: null,
  color: null,
  icon: null,
  cancelledAt: null,
  cancellationNotes: null,
  version: 1,
  createdAt: "2026-01-15T00:00:00.000Z",
  updatedAt: "2026-01-15T00:00:00.000Z",
};

const findActiveUserById = jest.fn(async (id: string) =>
  id === testUser.id ? testUser : null
);

const createUserSubscription = jest.fn(async () => createdSubscription);
const updateUserSubscription = jest.fn(async () => ({
  ...createdSubscription,
  version: 2,
  amount: 20,
}));
const listUserSubscriptions = jest.fn(async () => ({
  items: [createdSubscription],
  page: 1,
  limit: 20,
  total: 1,
  totalPages: 1,
}));
const getCurrentUser = jest.fn(async () => ({
  id: testUser.id,
  email: testUser.email,
  displayName: testUser.display_name,
  preferredCurrency: testUser.preferred_currency,
  createdAt: testUser.created_at.toISOString(),
}));

await jest.unstable_mockModule("../redis/client.js", () => ({
  redis: fakeRedis,
  redisKey: (...parts: string[]) => `mst:${parts.join(":")}`,
  connectRedis: async () => undefined,
  closeRedis: async () => undefined,
}));

await jest.unstable_mockModule("../jobs/queues.js", () => ({
  appQueue: {
    add: jest.fn(async () => ({ id: "job-1" })),
    close: jest.fn(async () => undefined),
  },
  closeQueue: jest.fn(async () => undefined),
  defaultJobOptions: {},
}));

await jest.unstable_mockModule("../jobs/producers.js", () => ({
  enqueueNotification: jest.fn(async () => "job-1"),
  enqueueTrialReminders: jest.fn(),
  enqueueRenewalReminders: jest.fn(),
  enqueueGhostDetection: jest.fn(),
  enqueueCurrencyRateUpdate: jest.fn(),
  enqueueMonthlyCalculations: jest.fn(),
  enqueueExpiredSessionCleanup: jest.fn(),
  enqueueWeeklySummary: jest.fn(),
  enqueueUpcomingWeekDigest: jest.fn(),
  registerRepeatableSchedulers: jest.fn(),
}));

await jest.unstable_mockModule("../repositories/user.repository.js", () => ({
  findActiveUserById,
  findUserByEmail: jest.fn(),
  createUser: jest.fn(),
}));

await jest.unstable_mockModule("../services/subscription.service.js", () => ({
  createUserSubscription,
  updateUserSubscription,
  listUserSubscriptions,
  getUserSubscription: jest.fn(),
  deleteUserSubscription: jest.fn(),
  getUpcomingSubscriptions: jest.fn(),
  getCalendar: jest.fn(),
  getBurnRate: jest.fn(),
  getUnusedSubscriptions: jest.fn(),
  getExpiringTrials: jest.fn(),
}));

await jest.unstable_mockModule("../services/auth.service.js", () => ({
  getCurrentUser,
  startRegistration: jest.fn(),
  verifyRegistration: jest.fn(),
  login: jest.fn(),
  verifyNewDeviceLogin: jest.fn(),
  resendOtp: jest.fn(),
  refresh: jest.fn(),
  logout: jest.fn(),
  forgotPassword: jest.fn(),
  resetPassword: jest.fn(),
  deleteAccount: jest.fn(),
}));

const { default: app } = await import("../app.js");
const { signAccessToken } = await import("../utils/tokens.js");

function authHeader() {
  const token = signAccessToken({
    sub: testUser.id,
    email: testUser.email,
  });
  return { Authorization: `Bearer ${token}` };
}

describe("API (supertest)", () => {
  beforeEach(() => {
    fakeRedis.store.clear();
    findActiveUserById.mockClear();
    createUserSubscription.mockClear();
    updateUserSubscription.mockReset();
    updateUserSubscription.mockResolvedValue({
      ...createdSubscription,
      version: 2,
      amount: 20,
    });
    listUserSubscriptions.mockClear();
    getCurrentUser.mockClear();
  });

  test("GET / returns API metadata", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      name: "Micro Subscription Tracker API",
    });
  });

  test("GET /api/health does not require auth", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("ok");
  });

  test("GET /api/subscriptions without token returns 401", async () => {
    const res = await request(app).get("/api/subscriptions");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test("GET /api/subscriptions with invalid token returns 401", async () => {
    const res = await request(app)
      .get("/api/subscriptions")
      .set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });

  test("GET /api/auth/me with valid token returns the user", async () => {
    const res = await request(app).get("/api/auth/me").set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({
      id: testUser.id,
      email: testUser.email,
    });
  });

  test("POST /api/subscriptions creates a subscription", async () => {
    const res = await request(app)
      .post("/api/subscriptions")
      .set(authHeader())
      .send({
        name: "Netflix",
        amount: 15.99,
        billingCycle: "monthly",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.subscription.name).toBe("Netflix");
    expect(createUserSubscription).toHaveBeenCalled();
  });

  test("POST /api/subscriptions rejects invalid body", async () => {
    const res = await request(app)
      .post("/api/subscriptions")
      .set(authHeader())
      .send({ name: "", amount: -1 });

    expect(res.status).toBe(400);
    expect(createUserSubscription).not.toHaveBeenCalled();
  });

  test("PATCH /api/subscriptions/:id returns 409 on version conflict", async () => {
    updateUserSubscription.mockRejectedValueOnce(
      new AppError(409, "Subscription was updated by another request", {
        currentVersion: 5,
        providedVersion: 1,
      })
    );

    const res = await request(app)
      .patch(`/api/subscriptions/${createdSubscription.id}`)
      .set(authHeader())
      .send({ version: 1, amount: 20 });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/updated by another request/i);
  });

  test("PATCH /api/subscriptions/:id updates when version matches", async () => {
    const res = await request(app)
      .patch(`/api/subscriptions/${createdSubscription.id}`)
      .set(authHeader())
      .send({ version: 1, amount: 20 });

    expect(res.status).toBe(200);
    expect(res.body.data.subscription.version).toBe(2);
    expect(updateUserSubscription).toHaveBeenCalled();
  });
});
