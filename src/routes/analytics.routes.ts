import { Router } from "express";
import * as analyticsController from "../controllers/analytics.controller.js";
import { optionalAuth } from "../middleware/requireAuth.js";
import { requireAnalyticsAdmin } from "../middleware/requireAnalyticsAdmin.js";
import { validateRequest } from "../middleware/validate.js";
import {
  funnelQuerySchema,
  trackAnalyticsEventSchema,
} from "../schemas/analytics.schemas.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.post(
  "/events",
  asyncHandler(optionalAuth),
  validateRequest(trackAnalyticsEventSchema),
  asyncHandler(analyticsController.trackEvent)
);

router.get(
  "/funnel/onboarding",
  requireAnalyticsAdmin,
  validateRequest(funnelQuerySchema, "query"),
  asyncHandler(analyticsController.getOnboardingFunnel)
);

router.get(
  "/funnel/paywall",
  requireAnalyticsAdmin,
  validateRequest(funnelQuerySchema, "query"),
  asyncHandler(analyticsController.getPaywallFunnel)
);

export default router;
