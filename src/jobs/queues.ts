import { Queue, type DefaultJobOptions } from "bullmq";
import config from "../config/index.js";
import { createQueueConnection } from "./connection.js";
import { QUEUE_NAME } from "./constants.js";

const connection = createQueueConnection();

export const defaultJobOptions: DefaultJobOptions = {
  attempts: config.jobs.attempts,
  backoff: {
    type: "exponential",
    delay: config.jobs.backoffMs,
  },
  removeOnComplete: 200,
  removeOnFail: 500,
};

export const appQueue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions,
  prefix: `${config.redis.keyPrefix}bull`,
});

export async function closeQueue(): Promise<void> {
  await appQueue.close();
  await connection.quit();
}
