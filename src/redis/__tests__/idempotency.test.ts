import { jest } from "@jest/globals";

type StoredValue = string;

function createFakeRedis() {
  const store = new Map<string, StoredValue>();

  return {
    store,
    async get(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async set(
      key: string,
      value: string,
      ...args: Array<string | number>
    ): Promise<"OK" | null> {
      const nx = args.includes("NX");
      if (nx && store.has(key)) {
        return null;
      }
      store.set(key, value);
      return "OK";
    },
    async del(key: string): Promise<number> {
      return store.delete(key) ? 1 : 0;
    },
  };
}

const fakeRedis = createFakeRedis();

await jest.unstable_mockModule("../client.js", () => ({
  redis: fakeRedis,
  redisKey: (...parts: string[]) => `mst:${parts.join(":")}`,
  connectRedis: async () => undefined,
  closeRedis: async () => undefined,
}));

const { hashIdempotencyRequest, runIdempotent } = await import(
  "../idempotency.js"
);
const { AppError } = await import("../../utils/errors.js");

describe("runIdempotent", () => {
  beforeEach(() => {
    fakeRedis.store.clear();
  });

  test("runs handler when Idempotency-Key is omitted", async () => {
    const handler = jest.fn(async () => ({
      statusCode: 201,
      body: { id: "sub-1" },
    }));

    const result = await runIdempotent({
      userId: "user-1",
      key: undefined,
      method: "POST",
      path: "/subscriptions",
      requestBody: { name: "Netflix" },
      handler,
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      statusCode: 201,
      body: { id: "sub-1" },
      replayed: false,
    });
  });

  test("claims key with NX, stores completed response, and replays it", async () => {
    const handler = jest.fn(async () => ({
      statusCode: 201,
      body: { id: "sub-2" },
    }));

    const first = await runIdempotent({
      userId: "user-1",
      key: "idem-key-12345",
      method: "POST",
      path: "/subscriptions",
      requestBody: { name: "Spotify", amount: 10 },
      handler,
    });

    const second = await runIdempotent({
      userId: "user-1",
      key: "idem-key-12345",
      method: "POST",
      path: "/subscriptions",
      requestBody: { name: "Spotify", amount: 10 },
      handler,
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(first.replayed).toBe(false);
    expect(second).toEqual({
      statusCode: 201,
      body: { id: "sub-2" },
      replayed: true,
    });
  });

  test("rejects reused key with a different request body", async () => {
    await runIdempotent({
      userId: "user-1",
      key: "idem-key-reuse-1",
      method: "POST",
      path: "/subscriptions",
      requestBody: { name: "A" },
      handler: async () => ({ statusCode: 201, body: { ok: true } }),
    });

    await expect(
      runIdempotent({
        userId: "user-1",
        key: "idem-key-reuse-1",
        method: "POST",
        path: "/subscriptions",
        requestBody: { name: "B" },
        handler: async () => ({ statusCode: 201, body: { ok: true } }),
      })
    ).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringMatching(/different request body/i),
    });
  });

  test("returns 409 while a request with the same key is still processing", async () => {
    fakeRedis.store.set(
      "mst:idempotency:user-1:idem-key-busy-1",
      JSON.stringify({
        requestHash: hashIdempotencyRequest({
          method: "POST",
          path: "/subscriptions",
          body: { name: "Busy" },
        }),
        status: "processing",
      })
    );

    await expect(
      runIdempotent({
        userId: "user-1",
        key: "idem-key-busy-1",
        method: "POST",
        path: "/subscriptions",
        requestBody: { name: "Busy" },
        handler: async () => ({ statusCode: 201, body: { ok: true } }),
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/still processing/i),
    });
  });

  test("deletes the key when the handler fails so retries can proceed", async () => {
    await expect(
      runIdempotent({
        userId: "user-1",
        key: "idem-key-fail-1",
        method: "POST",
        path: "/subscriptions",
        requestBody: { name: "Fail" },
        handler: async () => {
          throw new AppError(500, "boom");
        },
      })
    ).rejects.toMatchObject({ statusCode: 500 });

    expect(fakeRedis.store.has("mst:idempotency:user-1:idem-key-fail-1")).toBe(
      false
    );

    const recovered = await runIdempotent({
      userId: "user-1",
      key: "idem-key-fail-1",
      method: "POST",
      path: "/subscriptions",
      requestBody: { name: "Fail" },
      handler: async () => ({ statusCode: 201, body: { recovered: true } }),
    });

    expect(recovered).toEqual({
      statusCode: 201,
      body: { recovered: true },
      replayed: false,
    });
  });

  test("requires Idempotency-Key when required flag is set", async () => {
    await expect(
      runIdempotent({
        userId: "user-1",
        key: undefined,
        method: "POST",
        path: "/subscriptions",
        requestBody: {},
        required: true,
        handler: async () => ({ statusCode: 201, body: {} }),
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/Idempotency-Key/i),
    });
  });
});
