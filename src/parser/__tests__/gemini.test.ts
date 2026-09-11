import { afterEach, describe, expect, jest, test } from "@jest/globals";

const fetchMock = jest.fn<typeof fetch>();
global.fetch = fetchMock as unknown as typeof fetch;

const { isGeminiConfigured, parseReceiptWithGemini } = await import(
  "../gemini.js"
);

function geminiOk(body: unknown) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [{ text: JSON.stringify(body) }],
          },
        },
      ],
    }),
  } as Response);
}

describe("parseReceiptWithGemini", () => {
  afterEach(() => {
    fetchMock.mockReset();
  });

  test("reports configured when GEMINI_API_KEY is present", () => {
    expect(isGeminiConfigured()).toBe(true);
  });

  test("maps a structured Gemini subscription candidate", async () => {
    geminiOk({
      subscriptions: [
        {
          name: "Netflix",
          amount: 15.99,
          currency: "usd",
          billingCycle: "monthly",
          nextBillingDate: "2026-04-01",
          categorySlug: "Entertainment",
          confidence: 0.91,
          isSubscriptionLike: true,
        },
      ],
    });

    const rows = await parseReceiptWithGemini({
      text: "Netflix subscription receipt Total $15.99",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Netflix",
      amount: 15.99,
      currency: "USD",
      billingCycle: "monthly",
      nextBillingDate: "2026-04-01",
      categorySlug: "entertainment",
      confidence: 0.91,
      isSubscriptionLike: true,
      engine: "gemini",
    });
  });

  test("recovers merchant name from receipt text when Gemini returns Unknown", async () => {
    geminiOk({
      subscriptions: [
        {
          name: "Unknown",
          amount: 25,
          currency: "USD",
          billingCycle: "yearly",
          confidence: 0.6,
          isSubscriptionLike: false,
        },
      ],
    });

    const rows = await parseReceiptWithGemini({
      text: "Google Play · Developer registration fee · Total $25.00",
    });

    expect(rows[0]?.name.toLowerCase()).toContain("google");
    expect(rows[0]?.amount).toBe(25);
  });

  test("falls back to regex recovery when Gemini returns an empty list", async () => {
    geminiOk({ subscriptions: [] });

    const rows = await parseReceiptWithGemini({
      text: "Spotify Premium receipt Total $10.99 billed monthly",
    });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.name.toLowerCase()).toContain("spotify");
    expect(rows[0]?.amount).toBe(10.99);
    expect(rows[0]?.engine).toBe("gemini");
  });

  test("drops rows with non-positive amounts", async () => {
    geminiOk({
      subscriptions: [
        {
          name: "Bad",
          amount: 0,
          currency: "USD",
          billingCycle: "monthly",
          confidence: 0.9,
          isSubscriptionLike: true,
        },
      ],
    });

    const rows = await parseReceiptWithGemini({ text: "noise" });
    expect(rows).toEqual([]);
  });

  test("includes image inlineData when an image is provided", async () => {
    geminiOk({ subscriptions: [] });

    await parseReceiptWithGemini({
      imageBase64: "data:image/jpeg;base64,abc123",
      imageMimeType: "image/jpeg",
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const parts = body.contents[0].parts as Array<Record<string, unknown>>;
    expect(parts.some((part) => part.inlineData)).toBe(true);
    const inline = parts.find((part) => part.inlineData)?.inlineData as {
      data: string;
      mimeType: string;
    };
    expect(inline.data).toBe("abc123");
    expect(inline.mimeType).toBe("image/jpeg");
  });

  test("throws a clear error when Gemini HTTP fails", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: "rate limited" } }),
    } as Response);

    await expect(
      parseReceiptWithGemini({ text: "Netflix $10" })
    ).rejects.toThrow(/rate limited/i);
  });
});
