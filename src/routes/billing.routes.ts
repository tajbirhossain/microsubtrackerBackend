import { Router } from "express";
import * as billingController from "../controllers/billing.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validateRequest } from "../middleware/validate.js";
import { checkoutBodySchema } from "../schemas/billing.schemas.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.post(
  "/checkout",
  asyncHandler(requireAuth),
  validateRequest(checkoutBodySchema, "body"),
  asyncHandler(billingController.startCheckout)
);

router.get(
  "/status",
  asyncHandler(requireAuth),
  asyncHandler(billingController.getStatus)
);

router.post("/webhooks", asyncHandler(billingController.handleWebhook));

export default router;
