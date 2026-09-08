import { randomUUID } from "node:crypto";
import pino, { type Logger } from "pino";
import config from "../config/index.js";

const level = process.env.LOG_LEVEL?.trim() || (config.isDev ? "debug" : "info");

export const logger: Logger = pino({
  level,
  base: {
    service: "microsubtracker-api",
    env: config.env,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "password",
      "passwordHash",
      "refreshToken",
      "accessToken",
      "authorization",
      "code",
      "req.headers.authorization",
      "body.password",
      "body.refreshToken",
      "body.code",
    ],
    censor: "[Redacted]",
  },
  ...(config.isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        },
      }
    : {}),
});

export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}

export function createRequestId(existing?: string | null): string {
  const trimmed = existing?.trim();
  if (trimmed && trimmed.length >= 8 && trimmed.length <= 128) {
    return trimmed;
  }
  return randomUUID();
}

export type { Logger };
