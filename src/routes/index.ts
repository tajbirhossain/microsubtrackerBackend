import { Router } from "express";
import analyticsRoutes from "./analytics.routes.js";
import authRoutes from "./auth.routes.js";
import currencyRoutes from "./currency.routes.js";
import healthRoutes from "./health.routes.js";
import notificationRoutes from "./notification.routes.js";
import parserRoutes from "./parser.routes.js";
import subscriptionRoutes from "./subscription.routes.js";

const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/subscriptions", subscriptionRoutes);
router.use("/parser", parserRoutes);
router.use("/notifications", notificationRoutes);
router.use("/currency", currencyRoutes);
router.use("/analytics", analyticsRoutes);

export default router;
