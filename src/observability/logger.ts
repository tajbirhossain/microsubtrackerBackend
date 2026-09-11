import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import pino, { type Logger } from "pino";
import config from "../config/index.js";

const level = process.env.LOG_LEVEL?.trim() || (config.isDev ? "debug" : "info");

/** Pretty logs only when the package is installed (local dev). Never on Render/Docker prod. */
function prettyTransport():
  | { transport: { target: string; options: Record<string, unknown> } }
  | Record<string, never> {
  if (!config.isDev || process.env.RENDER === "true") {
    return {};
  }
  try {
    const require = createRequire(import.meta.url);
    const target = require.resolve("pino-pretty");
    return {
      transport: {
        target,
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },
    };
  } catch {
    return {};
  }
}

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
  ...prettyTransport(),
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
