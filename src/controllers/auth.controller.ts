import type { Request, Response } from "express";
import * as authService from "../services/auth.service.js";

export async function register(req: Request, res: Response): Promise<void> {
  const result = await authService.register(req.body);
  res.status(201).json({
    success: true,
    message: "Account created",
    data: result,
  });
}

export async function login(req: Request, res: Response): Promise<void> {
  const result = await authService.login(req.body);
  res.json({
    success: true,
    message: "Logged in",
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

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const user = await authService.verifyEmail(req.body.token);
  res.json({
    success: true,
    message: "Email verified",
    data: { user },
  });
}

export async function resendVerification(
  req: Request,
  res: Response
): Promise<void> {
  const result = await authService.resendVerification(req.body.email);
  res.json({
    success: true,
    message: "If that email exists, a verification link was sent",
    data: result,
  });
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const result = await authService.forgotPassword(req.body.email);
  res.json({
    success: true,
    message: "If that email exists, a reset link was sent",
    data: result,
  });
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const result = await authService.resetPassword(req.body.token, req.body.password);
  res.json({
    success: true,
    message: "Password updated",
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
