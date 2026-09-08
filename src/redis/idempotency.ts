import { createHash } from "node:crypto";
import config from "../config/index.js";
import { AppError } from "../utils/errors.js";
import { redis, redisKey } from "./client.js";

export type IdempotentResponse = {
  statusCode: number;
  body: unknown;
  replayed: boolean;
};

type StoredIdempotency = {
  requestHash: string;
  status: "processing" | "completed";
  responseStatus?: number;
  responseBody?: unknown;
};

export function hashIdempotencyRequest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value ?? null))
    .digest("hex");
}

function keyFor(userId: string, key: string): string {
  return redisKey("idempotency", userId, key);
}

/**
 * Redis-backed idempotency: same user + key + body replays the stored response.
 */
export async function runIdempotent(input: {
  userId: string;
  key: string | undefined;
  method: string;
  path: string;
  requestBody: unknown;
  required?: boolean;
  ttlSeconds?: number;
  handler: () => Promise<{ statusCode: number; body: unknown }>;
}): Promise<IdempotentResponse> {
  if (!input.key) {
    if (input.required) {
      throw new AppError(400, "Idempotency-Key header is required");
    }
    const result = await input.handler();
    return { ...result, replayed: false };
  }

  const key = input.key.trim();
  if (key.length < 8 || key.length > 128) {
    throw new AppError(400, "Idempotency-Key must be 8-128 characters");
  }

  const requestHash = hashIdempotencyRequest({
    method: input.method,
    path: input.path,
    body: input.requestBody,
  });
  const ttlSeconds = input.ttlSeconds ?? config.redis.idempotencyTtlSeconds;
  const redisKeyName = keyFor(input.userId, key);

  const existingRaw = await redis.get(redisKeyName);
  if (existingRaw) {
    const existing = JSON.parse(existingRaw) as StoredIdempotency;

    if (existing.requestHash !== requestHash) {
      throw new AppError(
        422,
        "Idempotency-Key was reused with a different request body"
      );
    }

    if (existing.status === "completed") {
      return {
        statusCode: existing.responseStatus ?? 200,
        body: existing.responseBody,
        replayed: true,
      };
    }

    throw new AppError(
      409,
      "Request with this Idempotency-Key is still processing"
    );
  }

  const processing: StoredIdempotency = {
    requestHash,
    status: "processing",
  };

  const claimed = await redis.set(
    redisKeyName,
    JSON.stringify(processing),
    "EX",
    ttlSeconds,
    "NX"
  );

  if (claimed !== "OK") {
    const racedRaw = await redis.get(redisKeyName);
    if (racedRaw) {
      const raced = JSON.parse(racedRaw) as StoredIdempotency;
      if (
        raced.status === "completed" &&
        raced.requestHash === requestHash
      ) {
        return {
          statusCode: raced.responseStatus ?? 200,
          body: raced.responseBody,
          replayed: true,
        };
      }
    }
    throw new AppError(
      409,
      "Request with this Idempotency-Key is still processing"
    );
  }

  try {
    const result = await input.handler();
    const completed: StoredIdempotency = {
      requestHash,
      status: "completed",
      responseStatus: result.statusCode,
      responseBody: result.body,
    };
    await redis.set(
      redisKeyName,
      JSON.stringify(completed),
      "EX",
      ttlSeconds
    );
    return { ...result, replayed: false };
  } catch (error) {
    await redis.del(redisKeyName);
    throw error;
  }
}
