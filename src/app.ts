import express from "express";
import cors from "cors";
import helmet from "helmet";
import config from "./config/index.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { rejectClientUserId } from "./middleware/rejectClientUserId.js";
import { requireJsonContentType } from "./middleware/requireJsonContentType.js";
import {
  requestIdMiddleware,
  requestLoggingMiddleware,
} from "./middleware/requestContext.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { AppError } from "./utils/errors.js";
import { logger } from "./observability/logger.js";
import routes from "./routes/index.js";

const app = express();

app.disable("x-powered-by");

if (config.security.trustProxy) {
  app.set("trust proxy", 1);
}

app.use(requestIdMiddleware);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
    referrerPolicy: { policy: "no-referrer" },
  })
);

app.use(
  cors({
    origin(origin, callback) {
      const allowed = config.security.corsOrigins;

      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowed.includes("*") || allowed.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new AppError(403, "Origin not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Idempotency-Key",
      "X-Request-Id",
      "X-Analytics-Admin-Token",
    ],
    exposedHeaders: [
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Window",
      "Idempotent-Replayed",
      "X-Request-Id",
    ],
    maxAge: 86_400,
  })
);

app.use(express.json({ limit: "8mb", strict: true }));
app.use(express.urlencoded({ extended: false, limit: "8mb" }));
app.use(requireJsonContentType);
app.use(rejectClientUserId);
app.use(requestLoggingMiddleware);

app.get("/", (_req, res) => {
  res.json({
    success: true,
    name: "Micro Subscription Tracker API",
    version: "0.1.0",
  });
});

app.use("/api", rateLimit(), routes);

app.use(notFound);
app.use(errorHandler);

logger.info(
  {
    port: config.port,
    env: config.env,
    database: {
      supabase: config.database.isSupabase,
      ssl: Boolean(config.database.ssl),
      poolMax: config.database.poolMax,
      hasDirectUrl: Boolean(config.database.directUrl),
    },
  },
  "express_app_configured"
);

export default app;
