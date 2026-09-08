import type { Request, Response } from "express";
import * as authService from "../services/auth.service.js";

export async function startRegistration(
  req: Request,
  res: Response
): Promise<void> {
  const result = await authService.startRegistration(req.body);
  res.status(202).json({
    success: true,
    message: "OTP sent for registration",
    data: result,
  });
}

export async function verifyRegistration(
  req: Request,
  res: Response
): Promise<void> {
  const result = await authService.verifyRegistration(req.body);
  res.status(201).json({
    success: true,
    message: "Account created",
    data: result,
  });
}

export async function login(req: Request, res: Response): Promise<void> {
  const result = await authService.login(req.body);
  const requiresOtp = "requiresOtp" in result && result.requiresOtp;

  res.status(requiresOtp ? 202 : 200).json({
    success: true,
    message: requiresOtp
      ? "OTP required for new device"
      : "Logged in",
    data: result,
  });
}

export async function verifyNewDeviceLogin(
  req: Request,
  res: Response
): Promise<void> {
  const result = await authService.verifyNewDeviceLogin(req.body);
  res.json({
    success: true,
    message: "Logged in on new device",
    data: result,
  });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const result = await authService.refresh(req.body);
  res.json({
    success: true,
    message: "Token refreshed",
    data: result,
  });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const result = await authService.logout(req.body, req.user?.id);
  res.json({
    success: true,
    message: "Logged out",
    data: result,
  });
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await authService.getCurrentUser(req.user!.id);
  res.json({
    success: true,
    data: { user },
  });
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const result = await authService.forgotPassword(req.body);
  res.status(202).json({
    success: true,
    message: "If that phone number exists, an OTP was sent",
    data: result,
  });
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const result = await authService.resetPassword(req.body);
  res.json({
    success: true,
    message: "Password updated",
    data: result,
  });
}

export async function resendOtp(req: Request, res: Response): Promise<void> {
  const result = await authService.resendOtp(req.body);
  res.status(202).json({
    success: true,
    message: "OTP resent",
    data: result,
  });
}

export async function deleteAccount(req: Request, res: Response): Promise<void> {
  const result = await authService.deleteAccount(req.user!.id);
  res.json({
    success: true,
    message: "Account deleted",
    data: result,
  });
}
