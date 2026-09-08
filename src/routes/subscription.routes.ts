import { Router } from "express";
import * as subscriptionController from "../controllers/subscription.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validateRequest } from "../middleware/validate.js";
import {
  calendarQuerySchema,
  createSubscriptionSchema,
  deleteSubscriptionSchema,
  listSubscriptionsQuerySchema,
  subscriptionIdParamsSchema,
  upcomingQuerySchema,
  updateSubscriptionSchema,
} from "../schemas/subscription.schemas.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.use(asyncHandler(requireAuth));

router.post(
  "/",
  validateRequest(createSubscriptionSchema),
  asyncHandler(subscriptionController.createSubscription)
);

router.get(
  "/",
  validateRequest(listSubscriptionsQuerySchema, "query"),
  asyncHandler(subscriptionController.listSubscriptions)
);

router.get(
  "/upcoming",
  validateRequest(upcomingQuerySchema, "query"),
  asyncHandler(subscriptionController.getUpcoming)
);

router.get(
  "/calendar",
  validateRequest(calendarQuerySchema, "query"),
  asyncHandler(subscriptionController.getCalendar)
);

router.get(
  "/burn-rate",
  asyncHandler(subscriptionController.getBurnRate)
);

router.get(
  "/:id",
  validateRequest(subscriptionIdParamsSchema, "params"),
  asyncHandler(subscriptionController.getSubscription)
);

router.patch(
  "/:id",
  validateRequest(subscriptionIdParamsSchema, "params"),
  validateRequest(updateSubscriptionSchema),
  asyncHandler(subscriptionController.updateSubscription)
);

router.delete(
  "/:id",
  validateRequest(subscriptionIdParamsSchema, "params"),
  validateRequest(deleteSubscriptionSchema),
  asyncHandler(subscriptionController.deleteSubscription)
);

export default router;
