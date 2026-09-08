import { Router } from "express";
import * as notificationController from "../controllers/notification.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validateRequest } from "../middleware/validate.js";
import {
  listDeliveriesQuerySchema,
  testNotificationSchema,
  updatePreferencesSchema,
  updatePushTokenSchema,
} from "../schemas/notification.schemas.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.use(asyncHandler(requireAuth));

router.get(
  "/preferences",
  asyncHandler(notificationController.getPreferences)
);

router.patch(
  "/preferences",
  validateRequest(updatePreferencesSchema),
  asyncHandler(notificationController.updatePreferences)
);

router.put(
  "/push-token",
  validateRequest(updatePushTokenSchema),
  asyncHandler(notificationController.registerPushToken)
);

router.get(
  "/",
  validateRequest(listDeliveriesQuerySchema, "query"),
  asyncHandler(notificationController.listDeliveries)
);

router.post(
  "/test",
  validateRequest(testNotificationSchema),
  asyncHandler(notificationController.sendTestNotification)
);

export default router;
