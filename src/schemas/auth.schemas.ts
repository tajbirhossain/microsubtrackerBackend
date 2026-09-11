import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email("Enter a valid email address");

export const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "OTP must be a 6-digit code");

export const deviceSchema = z.object({
  deviceKey: z.string().trim().min(1).max(255),
  platform: z.enum(["android", "ios", "web"]),
  pushToken: z.string().trim().min(1).max(512).optional(),
  appVersion: z.string().trim().min(1).max(64).optional(),
});

export const registerStartSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(8).max(72),
    displayName: z.string().trim().min(1).max(80).optional(),
    preferredCurrency: z
      .string()
      .trim()
      .length(3)
      .transform((value) => value.toUpperCase())
      .optional(),
    device: deviceSchema,
  })
  .strict();

export const registerVerifySchema = z
  .object({
    email: emailSchema,
    code: otpCodeSchema,
    device: deviceSchema,
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(72),
    device: deviceSchema,
  })
  .strict();

export const loginVerifyDeviceSchema = z
  .object({
    email: emailSchema,
    code: otpCodeSchema,
    device: deviceSchema,
  })
  .strict();

export const refreshSchema = z
  .object({
    refreshToken: z.string().trim().min(20),
  })
  .strict();

export const logoutSchema = z
  .object({
    refreshToken: z.string().trim().min(20).optional(),
    allDevices: z.boolean().optional().default(false),
  })
  .strict();

export const forgotPasswordSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    email: emailSchema,
    code: otpCodeSchema,
    password: z.string().min(8).max(72),
  })
  .strict();

export const resendOtpSchema = z
  .object({
    email: emailSchema,
    purpose: z.enum(["registration", "new_device", "password_reset"]),
  })
  .strict();

export const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80),
  })
  .strict();

export type RegisterStartInput = z.infer<typeof registerStartSchema>;
export type RegisterVerifyInput = z.infer<typeof registerVerifySchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type LoginVerifyDeviceInput = z.infer<typeof loginVerifyDeviceSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type DeviceInput = z.infer<typeof deviceSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ResendOtpInput = z.infer<typeof resendOtpSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
