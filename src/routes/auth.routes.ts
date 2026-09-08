import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import { optionalAuth, requireAuth } from "../middleware/requireAuth.js";
import { validateRequest } from "../middleware/validate.js";
import {
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "../schemas/auth.schemas.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.post(
  "/register",
  validateRequest(registerSchema),
  asyncHandler(authController.register)
);

router.post(
  "/login",
  validateRequest(loginSchema),
  asyncHandler(authController.login)
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
  "/verify-email",
  validateRequest(verifyEmailSchema),
  asyncHandler(authController.verifyEmail)
);

router.post(
  "/resend-verification",
  validateRequest(resendVerificationSchema),
  asyncHandler(authController.resendVerification)
);

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
