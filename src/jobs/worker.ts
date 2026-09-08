import { Worker, type Job } from "bullmq";
import config from "../config/index.js";
import { createQueueConnection } from "./connection.js";
import { JobName, QUEUE_NAME, type NotificationJobData } from "./constants.js";
import {
  handleCurrencyRateUpdate,
  handleExpiredSessionCleanup,
  handleGhostDetection,
  handleMonthlyCalculations,
  handleProcessNotification,
  handleRenewalReminders,
  handleTrialReminders,
  handleUpcomingWeekDigest,
  handleWeeklySummary,
} from "./handlers.js";
import { registerRepeatableSchedulers } from "./producers.js";

const connection = createQueueConnection();

async function processJob(job: Job): Promise<unknown> {
  switch (job.name) {
    case JobName.TrialReminders:
      return handleTrialReminders();
    case JobName.RenewalReminders:
      return handleRenewalReminders();
    case JobName.GhostDetection:
      return handleGhostDetection();
    case JobName.CurrencyRateUpdate:
      return handleCurrencyRateUpdate();
    case JobName.ProcessNotification:
      return handleProcessNotification(job.data as NotificationJobData);
    case JobName.WeeklySummary:
      return handleWeeklySummary();
    case JobName.UpcomingWeekDigest:
      return handleUpcomingWeekDigest();
    case JobName.MonthlyCalculations:
      return handleMonthlyCalculations();
    case JobName.ExpiredSessionCleanup:
      return handleExpiredSessionCleanup();
    default:
      throw new Error(`Unknown job name: ${job.name}`);
  }
}

export async function startWorkers(): Promise<Worker> {
  await registerRepeatableSchedulers();

  const worker = new Worker(QUEUE_NAME, processJob, {
    connection,
    concurrency: config.jobs.concurrency,
    prefix: `${config.redis.keyPrefix}bull`,
  });

  worker.on("completed", (job) => {
    console.info(`[worker] completed ${job.name} id=${job.id}`);
  });

  worker.on("failed", (job, error) => {
    console.error(
      `[worker] failed ${job?.name ?? "unknown"} id=${job?.id} attempt=${job?.attemptsMade}:`,
      error.message
    );
  });

  worker.on("error", (error) => {
    console.error("[worker] error", error);
  });

  console.info(
    `[worker] listening on queue=${QUEUE_NAME} concurrency=${config.jobs.concurrency}`
  );

  return worker;
}

export async function stopWorkers(worker: Worker): Promise<void> {
  await worker.close();
  await connection.quit();
}
