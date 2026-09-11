import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { AppError } from "../../utils/errors.js";

const parseReceiptWithGemini = jest.fn();
const isGeminiConfigured = jest.fn(() => true);
const runParserPipeline = jest.fn();
const createParserEvent = jest.fn();
const findDeviceByUserAndKey = jest.fn(async () => null);

await jest.unstable_mockModule("../../parser/gemini.js", () => ({
  parseReceiptWithGemini,
  isGeminiConfigured,
}));

await jest.unstable_mockModule("../../parser/engine.js", () => ({
  LOW_CONFIDENCE_THRESHOLD: 0.55,
  runParserPipeline,
}));

await jest.unstable_mockModule("../../repositories/parser-event.repository.js", () => ({
  createParserEvent,
  findParserEventForUser: jest.fn(),
  listParserEventsForUser: jest.fn(),
  updateParserEventStatus: jest.fn(),
}));

await jest.unstable_mockModule("../../repositories/device.repository.js", () => ({
  findDeviceByUserAndKey,
}));

await jest.unstable_mockModule("../../repositories/category.repository.js", () => ({
  findCategoryForUser: jest.fn(),
}));

await jest.unstable_mockModule("../subscription.service.js", () => ({
  createUserSubscription: jest.fn(),
}));

const { ingestParserEvent } = await import("../parser.service.js");

function fakeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    user_id: "user-1",
    device_id: null,
    source_type: "paste",
    raw_payload: "Spotify Premium $10.99",
    normalized_payload: { engine: "regex" },
    merchant: "Spotify",
    amount: "10.99",
    currency: "USD",
    confidence: "0.8",
    status: "classified",
    error_message: null,
    created_at: new Date("2026-01-15T00:00:00.000Z"),
    updated_at: new Date("2026-01-15T00:00:00.000Z"),
    ...overrides,
  };
}

describe("ingestParserEvent Gemini → regex fallback", () => {
  beforeEach(() => {
    parseReceiptWithGemini.mockReset();
    isGeminiConfigured.mockReset();
    isGeminiConfigured.mockReturnValue(true);
    runParserPipeline.mockReset();
    createParserEvent.mockReset();
    createParserEvent.mockImplementation(async (input: Record<string, unknown>) =>
      fakeRow({
        merchant: input.merchant,
        amount: input.amount != null ? String(input.amount) : null,
        currency: input.currency,
        confidence: String(input.confidence ?? 0),
        status: input.status,
        normalized_payload: input.normalizedPayload,
        error_message: input.errorMessage ?? null,
      })
    );
  });

  test("uses Gemini results when extraction succeeds", async () => {
    parseReceiptWithGemini.mockResolvedValueOnce([
      {
        name: "Netflix",
        amount: 15.99,
        currency: "USD",
        billingCycle: "monthly",
        nextBillingDate: null,
        categorySlug: "entertainment",
        confidence: 0.9,
        isSubscriptionLike: true,
        merchantKey: "netflix",
        color: "#E50914",
        icon: "N",
        engine: "gemini",
      },
    ]);

    const result = await ingestParserEvent("user-1", {
      sourceType: "paste",
      rawPayload: "Netflix Total $15.99",
    });

    expect(result.engine).toBe("gemini");
    expect(result.event.merchant).toBe("Netflix");
    expect(runParserPipeline).not.toHaveBeenCalled();
  });

  test("falls back to regex when Gemini throws and text is available", async () => {
    parseReceiptWithGemini.mockRejectedValueOnce(new Error("Gemini down"));
    runParserPipeline.mockReturnValueOnce({
      merchant: "Spotify",
      amount: 10.99,
      currency: "USD",
      confidence: 0.8,
      isSubscriptionLike: true,
      needsManualEntry: false,
      merchantKey: "spotify",
      matchedPattern: {
        key: "spotify",
        categorySlug: "music",
        defaultBillingCycle: "monthly",
        color: "#1DB954",
        icon: "S",
      },
      signals: ["regex"],
      normalized: { text: "Spotify" },
    });

    const result = await ingestParserEvent("user-1", {
      sourceType: "paste",
      rawPayload: "Spotify Premium receipt Total $10.99",
    });

    expect(result.engine).toBe("regex");
    expect(result.event.merchant).toBe("Spotify");
    expect(runParserPipeline).toHaveBeenCalled();
  });

  test("image-only ingest fails clearly when Gemini is unavailable", async () => {
    parseReceiptWithGemini.mockRejectedValueOnce(new Error("model overloaded"));

    await expect(
      ingestParserEvent("user-1", {
        sourceType: "receipt_image",
        imageBase64: "abc",
        imageMimeType: "image/jpeg",
      })
    ).rejects.toMatchObject({
      statusCode: 503,
      message: expect.stringMatching(/model overloaded|receipt image/i),
    });

    expect(runParserPipeline).not.toHaveBeenCalled();
  });

  test("rejects image ingest when Gemini is not configured", async () => {
    isGeminiConfigured.mockReturnValue(false);

    await expect(
      ingestParserEvent("user-1", {
        sourceType: "receipt_image",
        imageBase64: "abc",
        imageMimeType: "image/jpeg",
      })
    ).rejects.toBeInstanceOf(AppError);
  });
});
