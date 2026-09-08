import { Router } from "express";
import authRoutes from "./auth.routes.js";
import healthRoutes from "./health.routes.js";
import parserRoutes from "./parser.routes.js";
import subscriptionRoutes from "./subscription.routes.js";

const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/subscriptions", subscriptionRoutes);
router.use("/parser", parserRoutes);

export default router;
