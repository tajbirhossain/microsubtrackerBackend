import { appQueue } from "./queues.js";
import { JobName, type NotificationJobData } from "./constants.js";

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Enqueue helpers use stable jobIds so retries/duplicates stay idempotent. */
export async function enqueueTrialReminders(): Promise<string | undefined> {
  const job = await appQueue.add(
    JobName.TrialReminders,
    {},
    { jobId: `${JobName.TrialReminders}:${todayKey()}` }
  );
  return job.id;
}

export async function enqueueRenewalReminders(): Promise<string | undefined> {
  const job = await appQueue.add(
    JobName.RenewalReminders,
    {},
    { jobId: `${JobName.RenewalReminders}:${todayKey()}` }
  );
  return job.id;
}

export async function enqueueGhostDetection(): Promise<string | undefined> {
  const job = await appQueue.add(
    JobName.GhostDetection,
    {},
    { jobId: `${JobName.GhostDetection}:${todayKey()}` }
  );
  return job.id;
}

export async function enqueueCurrencyRateUpdate(): Promise<string | undefined> {
  const job = await appQueue.add(
    JobName.CurrencyRateUpdate,
    {},
    { jobId: `${JobName.CurrencyRateUpdate}:${todayKey()}-h${new Date().getUTCHours()}` }
  );
  return job.id;
}

export async function enqueueMonthlyCalculations(): Promise<string | undefined> {
  const monthKey = todayKey().slice(0, 7);
  const job = await appQueue.add(
    JobName.MonthlyCalculations,
    {},
    { jobId: `${JobName.MonthlyCalculations}:${monthKey}` }
  );
  return job.id;
}

export async function enqueueExpiredSessionCleanup(): Promise<string | undefined> {
  const job = await appQueue.add(
    JobName.ExpiredSessionCleanup,
    {},
    { jobId: `${JobName.ExpiredSessionCleanup}:${todayKey()}-h${new Date().getUTCHours()}` }
  );
  return job.id;
}

export async function enqueueNotification(
  data: NotificationJobData
): Promise<string | undefined> {
  const job = await appQueue.add(JobName.ProcessNotification, data, {
    jobId: `notify:${data.dedupeKey}`,
  });
  return job.id;
}

export async function registerRepeatableSchedulers(): Promise<void> {
  await appQueue.upsertJobScheduler(
    "scheduler:trial-reminders",
    { pattern: "0 9 * * *" },
    { name: JobName.TrialReminders, data: {} }
  );

  await appQueue.upsertJobScheduler(
    "scheduler:renewal-reminders",
    { pattern: "15 9 * * *" },
    { name: JobName.RenewalReminders, data: {} }
  );

  await appQueue.upsertJobScheduler(
    "scheduler:ghost-detection",
    { pattern: "0 10 * * *" },
    { name: JobName.GhostDetection, data: {} }
  );

  await appQueue.upsertJobScheduler(
    "scheduler:currency-rates",
    { every: 60 * 60 * 1000 },
    { name: JobName.CurrencyRateUpdate, data: {} }
  );

  await appQueue.upsertJobScheduler(
    "scheduler:session-cleanup",
    { every: 60 * 60 * 1000 },
    { name: JobName.ExpiredSessionCleanup, data: {} }
  );

  await appQueue.upsertJobScheduler(
    "scheduler:monthly-calculations",
    { pattern: "0 3 1 * *" },
    { name: JobName.MonthlyCalculations, data: {} }
  );
}
