import { Router } from "express";
import * as billingController from "../controllers/billing.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validateRequest } from "../middleware/validate.js";
import { googleConfirmBodySchema } from "../schemas/billing.schemas.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.post(
  "/google/confirm",
  asyncHandler(requireAuth),
  validateRequest(googleConfirmBodySchema, "body"),
  asyncHandler(billingController.confirmGooglePurchase)
);

router.get(
  "/status",
  asyncHandler(requireAuth),
  asyncHandler(billingController.getStatus)
);

export default router;
