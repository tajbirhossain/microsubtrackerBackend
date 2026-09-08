import { Worker, type Job } from "bullmq";
import config from "../config/index.js";
import { captureError } from "../observability/errors.js";
import { childLogger } from "../observability/logger.js";
import { recordJobResult } from "../observability/metrics.js";
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
const workerLog = childLogger({ component: "worker" });

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
    const durationMs = job.finishedOn && job.processedOn
      ? job.finishedOn - job.processedOn
      : undefined;

    workerLog.info(
      {
        job_name: job.name,
        job_id: job.id,
        duration_ms: durationMs,
      },
      "job_completed"
    );

    void recordJobResult({
      jobName: job.name,
      outcome: "completed",
      durationMs,
    });
  });

  worker.on("failed", (job, error) => {
    workerLog.error(
      {
        job_name: job?.name,
        job_id: job?.id,
        attempt: job?.attemptsMade,
        err: { message: error.message, stack: error.stack },
      },
      "job_failed"
    );

    void recordJobResult({
      jobName: job?.name ?? "unknown",
      outcome: "failed",
    });

    void captureError(error, {
      jobName: job?.name,
      jobId: job?.id,
    });
  });

  worker.on("error", (error) => {
    void captureError(error, { jobName: "worker" });
  });

  workerLog.info(
    {
      queue: QUEUE_NAME,
      concurrency: config.jobs.concurrency,
    },
    "worker_listening"
  );

  return worker;
}

export async function stopWorkers(worker: Worker): Promise<void> {
  await worker.close();
  await connection.quit();
  workerLog.info("worker_stopped");
}
