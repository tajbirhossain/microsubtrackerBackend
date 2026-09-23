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

app.use(
  express.json({
    limit: "8mb",
    strict: true,
    verify: (req, _res, buf) => {
      const url = "originalUrl" in req ? String((req as { originalUrl?: string }).originalUrl ?? "") : "";
      if (url.includes("/billing/webhooks")) {
        (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      }
    },
  })
);
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

/** Paddle.js page — default payment link target. Opens overlay from ?_ptxn= */
app.get("/checkout", (_req, res) => {
  const token = config.paddle.clientToken;
  if (!token) {
    res.status(503).type("html").send("<p>Paddle client token is not configured.</p>");
    return;
  }

  const isSandbox = config.paddle.env !== "live";
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Micro Sub Tracker Checkout</title>
    <script src="https://cdn.paddle.com/paddle/v2/paddle.js"></script>
    <style>
      body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
        background:#0b0b0c; color:#fff; font-family:system-ui,sans-serif; text-align:center; padding:24px; }
      p { opacity:.8; line-height:1.5; }
    </style>
  </head>
  <body>
    <div>
      <p id="status">Opening secure checkout…</p>
      <p id="hint" style="display:none;font-size:14px;margin-top:12px;"></p>
    </div>
    <script>
      (function () {
        var token = ${JSON.stringify(token)};
        var sandbox = ${isSandbox ? "true" : "false"};
        var statusEl = document.getElementById("status");
        var hintEl = document.getElementById("hint");
        try {
          if (sandbox) { Paddle.Environment.set("sandbox"); }
          Paddle.Initialize({ token: token });
          var params = new URLSearchParams(window.location.search);
          var txn = params.get("_ptxn");
          if (!txn) {
            statusEl.textContent = "Missing checkout session.";
            hintEl.style.display = "block";
            hintEl.textContent = "Return to the app and tap Get Plus / Get Pro again.";
            return;
          }
          // Paddle.js auto-opens when _ptxn is present after Initialize.
          // Explicit open as a backup for some mobile webviews:
          Paddle.Checkout.open({ transactionId: txn });
        } catch (err) {
          statusEl.textContent = "Could not open checkout.";
          hintEl.style.display = "block";
          hintEl.textContent = String(err && err.message ? err.message : err);
        }
      })();
    </script>
  </body>
</html>`);
});

/** Paddle success_url landing page → deep-link back into the Expo app. */
app.get("/billing/return", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Returning to Micro Sub Tracker…</title>
    <meta http-equiv="refresh" content="0;url=microsubtracker://billing/return" />
  </head>
  <body style="font-family: system-ui, sans-serif; background:#0b0b0c; color:#fff; display:flex; min-height:100vh; align-items:center; justify-content:center;">
    <p>Payment received. Returning to the app…<br/><a style="color:#5B9EFF" href="microsubtracker://billing/return">Tap here if nothing happens</a></p>
    <script>window.location.replace("microsubtracker://billing/return");</script>
  </body>
</html>`);
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
