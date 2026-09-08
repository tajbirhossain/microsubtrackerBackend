import { z } from "zod";

export const deviceSchema = z.object({
  deviceKey: z.string().trim().min(1).max(255),
  platform: z.enum(["android", "ios", "web"]),
  pushToken: z.string().trim().min(1).max(512).optional(),
  appVersion: z.string().trim().min(1).max(64).optional(),
});

export const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(80).optional(),
  preferredCurrency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase())
    .optional(),
  device: deviceSchema,
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
  device: deviceSchema,
});

export const refreshSchema = z.object({
  refreshToken: z.string().trim().min(20),
});

export const logoutSchema = z.object({
  refreshToken: z.string().trim().min(20).optional(),
  allDevices: z.boolean().optional().default(false),
});

export const verifyEmailSchema = z.object({
  token: z.string().trim().min(20),
});

export const resendVerificationSchema = z.object({
  email: z.string().trim().email().max(254),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email().max(254),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(20),
  password: z.string().min(8).max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type DeviceInput = z.infer<typeof deviceSchema>;
