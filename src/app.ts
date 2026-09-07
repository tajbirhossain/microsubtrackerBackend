import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import config from "./config/index.js";
import routes from "./routes/index.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

app.use("/api", routes);

app.use(notFound);
app.use(errorHandler);

export default app;
