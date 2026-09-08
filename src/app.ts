import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import config from "./config/index.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { rejectClientUserId } from "./middleware/rejectClientUserId.js";
import { requireJsonContentType } from "./middleware/requireJsonContentType.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { AppError } from "./utils/errors.js";
import routes from "./routes/index.js";

const app = express();

app.disable("x-powered-by");

if (config.security.trustProxy) {
  app.set("trust proxy", 1);
}

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

      // Native apps / server-to-server often send no Origin.
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
    ],
    exposedHeaders: [
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Window",
      "Idempotent-Replayed",
    ],
    maxAge: 86_400,
  })
);

app.use(express.json({ limit: "1mb", strict: true }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(requireJsonContentType);
app.use(rejectClientUserId);

if (config.isDev) {
  app.use(morgan("dev"));
}

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

export default app;
