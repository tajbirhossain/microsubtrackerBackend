import { Queue, type DefaultJobOptions } from "bullmq";
import type { Redis } from "ioredis";
import config from "../config/index.js";
import { createQueueConnection } from "./connection.js";
import { QUEUE_NAME } from "./constants.js";

export const defaultJobOptions: DefaultJobOptions = {
  attempts: config.jobs.attempts,
  backoff: {
    type: "exponential",
    delay: config.jobs.backoffMs,
  },
  removeOnComplete: 200,
  removeOnFail: 500,
};

let connection: Redis | null = null;
let queue: Queue | null = null;

/** Lazy BullMQ queue — avoids opening a second Redis link on every serverless cold path until enqueue. */
export function getAppQueue(): Queue {
  if (!queue) {
    connection = createQueueConnection();
    queue = new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions,
      prefix: `${config.redis.keyPrefix}bull`,
    });
  }
  return queue;
}

/** Back-compat proxy so existing `appQueue.add(...)` call sites keep working. */
export const appQueue: Queue = new Proxy({} as Queue, {
  get(_target, property, receiver) {
    const real = getAppQueue();
    const value = Reflect.get(real, property, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export async function closeQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
  if (connection) {
    await connection.quit();
    connection = null;
  }
}
