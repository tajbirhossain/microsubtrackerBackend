import {
  createSubscriptionSchema,
  updateSubscriptionSchema,
} from "../subscription.schemas.js";

describe("updateSubscriptionSchema", () => {
  test("requires version", () => {
    const result = updateSubscriptionSchema.safeParse({ amount: 10 });
    expect(result.success).toBe(false);
  });

  test("requires at least one field besides version", () => {
    const result = updateSubscriptionSchema.safeParse({ version: 1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(
        /At least one field besides version/i
      );
    }
  });

  test("accepts version plus a mutable field", () => {
    const result = updateSubscriptionSchema.safeParse({
      version: 2,
      amount: 12.5,
      currency: "bdt",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe("BDT");
      expect(result.data.amount).toBe(12.5);
      expect(result.data.version).toBe(2);
    }
  });
});

describe("createSubscriptionSchema", () => {
  test("defaults currency to USD", () => {
    const result = createSubscriptionSchema.safeParse({
      name: "Notion",
      amount: 10,
      billingCycle: "monthly",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe("USD");
    }
  });

  test("requires trialEndsAt when isTrial is true", () => {
    const result = createSubscriptionSchema.safeParse({
      name: "Trial App",
      amount: 0,
      billingCycle: "monthly",
      isTrial: true,
    });
    expect(result.success).toBe(false);
  });
});
