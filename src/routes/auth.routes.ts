import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import { optionalAuth, requireAuth } from "../middleware/requireAuth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { validateRequest } from "../middleware/validate.js";
import {
  forgotPasswordSchema,
  loginSchema,
  loginVerifyDeviceSchema,
  logoutSchema,
  refreshSchema,
  registerStartSchema,
  registerVerifySchema,
  resendOtpSchema,
  resetPasswordSchema,
} from "../schemas/auth.schemas.js";
import config from "../config/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
const authLimiter = rateLimit({
  max: config.redis.authRateLimitMax,
  prefix: "rl:auth",
});

router.use(asyncHandler(authLimiter));

router.post(
  "/register/start",
  validateRequest(registerStartSchema),
  asyncHandler(authController.startRegistration)
);

router.post(
  "/register/verify",
  validateRequest(registerVerifySchema),
  asyncHandler(authController.verifyRegistration)
);

router.post(
  "/login",
  validateRequest(loginSchema),
  asyncHandler(authController.login)
);

router.post(
  "/login/verify-device",
  validateRequest(loginVerifyDeviceSchema),
  asyncHandler(authController.verifyNewDeviceLogin)
);

router.post(
  "/otp/resend",
  validateRequest(resendOtpSchema),
  asyncHandler(authController.resendOtp)
);

router.post(
  "/refresh",
  validateRequest(refreshSchema),
  asyncHandler(authController.refresh)
);

router.post(
  "/logout",
  validateRequest(logoutSchema),
  asyncHandler(optionalAuth),
  asyncHandler(authController.logout)
);

router.get("/me", asyncHandler(requireAuth), asyncHandler(authController.me));

router.post(
  "/forgot-password",
  validateRequest(forgotPasswordSchema),
  asyncHandler(authController.forgotPassword)
);

router.post(
  "/reset-password",
  validateRequest(resetPasswordSchema),
  asyncHandler(authController.resetPassword)
);

router.delete(
  "/account",
  asyncHandler(requireAuth),
  asyncHandler(authController.deleteAccount)
);

export default router;
