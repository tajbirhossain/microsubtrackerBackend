import { jest } from "@jest/globals";
import { JobName } from "../constants.js";

const add = jest.fn(async (_name: string, _data: unknown, opts: { jobId?: string }) => ({
  id: opts.jobId,
}));

await jest.unstable_mockModule("../queues.js", () => ({
  appQueue: { add },
  closeQueue: async () => undefined,
  defaultJobOptions: {},
}));

const {
  enqueueTrialReminders,
  enqueueCurrencyRateUpdate,
  enqueueMonthlyCalculations,
  enqueueNotification,
} = await import("../producers.js");

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

describe("stable jobId formats", () => {
  beforeEach(() => {
    add.mockClear();
  });

  test("trial reminders use the UTC calendar day", async () => {
    await enqueueTrialReminders();
    expect(add).toHaveBeenCalledWith(
      JobName.TrialReminders,
      {},
      expect.objectContaining({
        jobId: `${JobName.TrialReminders}:${todayKey()}`,
      })
    );
  });

  test("currency updates include UTC hour for hourly uniqueness", async () => {
    await enqueueCurrencyRateUpdate();
    expect(add).toHaveBeenCalledWith(
      JobName.CurrencyRateUpdate,
      {},
      expect.objectContaining({
        jobId: `${JobName.CurrencyRateUpdate}:${todayKey()}-h${new Date().getUTCHours()}`,
      })
    );
  });

  test("monthly calculations key off YYYY-MM", async () => {
    await enqueueMonthlyCalculations();
    expect(add).toHaveBeenCalledWith(
      JobName.MonthlyCalculations,
      {},
      expect.objectContaining({
        jobId: `${JobName.MonthlyCalculations}:${todayKey().slice(0, 7)}`,
      })
    );
  });

  test("notifications use dedupeKey as the stable job id", async () => {
    await enqueueNotification({
      userId: "user-1",
      subscriptionId: "sub-1",
      type: "renewal",
      title: "Renewal",
      body: "Due soon",
      dedupeKey: "renewal:sub-1:2026-01-15",
    });

    expect(add).toHaveBeenCalledWith(
      JobName.ProcessNotification,
      expect.objectContaining({ dedupeKey: "renewal:sub-1:2026-01-15" }),
      expect.objectContaining({
        jobId: "notify:renewal:sub-1:2026-01-15",
      })
    );
  });
});
