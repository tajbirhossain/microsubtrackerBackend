import { Router } from "express";
import healthRoutes from "./health.routes.js";

const router = Router();

router.use("/health", healthRoutes);

// Future routes:
// router.use("/auth", authRoutes);
// router.use("/subscriptions", subscriptionRoutes);
// router.use("/payments", paymentRoutes);

export default router;
