import { runParserPipeline } from "./engine.js";

export type ParserFixture = {
  name: string;
  rawPayload: string;
  sourceType: "sms" | "notification";
  expect: {
    merchant: string;
    amount: number;
    currency: string;
    minConfidence: number;
    needsManualEntry: boolean;
  };
};

export const PARSER_FIXTURES: ParserFixture[] = [
  {
    name: "netflix sms charge",
    sourceType: "sms",
    rawPayload:
      "Netflix: Your membership was charged USD 15.49. Manage your subscription in Account.",
    expect: {
      merchant: "Netflix",
      amount: 15.49,
      currency: "USD",
      minConfidence: 0.8,
      needsManualEntry: false,
    },
  },
  {
    name: "spotify notification renew",
    sourceType: "notification",
    rawPayload:
      "Spotify Premium renewed for $10.99. Your subscription renews automatically each month.",
    expect: {
      merchant: "Spotify",
      amount: 10.99,
      currency: "USD",
      minConfidence: 0.8,
      needsManualEntry: false,
    },
  },
  {
    name: "canva bank alert",
    sourceType: "sms",
    rawPayload: "Bank alert: Canva*PRO charged $12.99. Recurring billing.",
    expect: {
      merchant: "Canva Pro",
      amount: 12.99,
      currency: "USD",
      minConfidence: 0.75,
      needsManualEntry: false,
    },
  },
  {
    name: "low confidence unknown text",
    sourceType: "sms",
    rawPayload: "Your package has been delivered to the front desk.",
    expect: {
      merchant: "",
      amount: 0,
      currency: "",
      minConfidence: 0,
      needsManualEntry: true,
    },
  },
];

export function assertFixtures(): { passed: number; failed: string[] } {
  const failed: string[] = [];

  for (const fixture of PARSER_FIXTURES) {
    const result = runParserPipeline({
      rawPayload: fixture.rawPayload,
      sourceType: fixture.sourceType,
    });

    if (fixture.expect.needsManualEntry) {
      if (!result.needsManualEntry) {
        failed.push(`${fixture.name}: expected manual entry`);
      }
      continue;
    }

    if (result.merchant !== fixture.expect.merchant) {
      failed.push(
        `${fixture.name}: merchant ${result.merchant} != ${fixture.expect.merchant}`
      );
    }
    if (result.amount !== fixture.expect.amount) {
      failed.push(
        `${fixture.name}: amount ${result.amount} != ${fixture.expect.amount}`
      );
    }
    if (result.currency !== fixture.expect.currency) {
      failed.push(
        `${fixture.name}: currency ${result.currency} != ${fixture.expect.currency}`
      );
    }
    if (result.confidence < fixture.expect.minConfidence) {
      failed.push(
        `${fixture.name}: confidence ${result.confidence} < ${fixture.expect.minConfidence}`
      );
    }
    if (result.needsManualEntry) {
      failed.push(`${fixture.name}: unexpectedly needs manual entry`);
    }
  }

  return {
    passed: PARSER_FIXTURES.length - failed.length,
    failed,
  };
}
