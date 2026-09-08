import type { PoolClient } from "pg";
import config from "../config/index.js";
import { withTransaction } from "../db/transaction.js";
import {
  findDeviceByUserAndKey,
  upsertDevice,
} from "../repositories/device.repository.js";
import { createDefaultNotificationPreferences } from "../repositories/notification-preferences.repository.js";
import {
  consumeOtpChallenge,
  createOtpChallenge,
  findActiveOtpChallenge,
  incrementOtpAttempts,
} from "../repositories/otp.repository.js";
import {
  createRefreshToken,
  findActiveRefreshTokenByHash,
  revokeRefreshTokenById,
  revokeRefreshTokensForUser,
} from "../repositories/refresh-token.repository.js";
import {
  createUser,
  findActiveUserById,
  findActiveUserByPhone,
  softDeleteUser,
  updatePasswordHash,
} from "../repositories/user.repository.js";
import type {
  DeviceInput,
  ForgotPasswordInput,
  LoginInput,
  LoginVerifyDeviceInput,
  LogoutInput,
  RefreshInput,
  RegisterStartInput,
  RegisterVerifyInput,
  ResendOtpInput,
  ResetPasswordInput,
} from "../schemas/auth.schemas.js";
import type { AuthTokens, AuthUser, OtpPurpose } from "../types/index.js";
import { AppError } from "../utils/errors.js";
import { hashPassword, TIMING_SAFE_DUMMY_HASH, verifyPassword } from "../utils/password.js";
import { logger } from "../observability/logger.js";
import {
  addSeconds,
  generateOpaqueToken,
  generateOtpCode,
  hashToken,
  signAccessToken,
} from "../utils/tokens.js";
import {
  deleteCachedSession,
  setCachedSession,
} from "../redis/session.js";
import { toAuthUser } from "./auth.mapper.js";

type AuthSessionResult = {
  user: AuthUser;
  tokens: AuthTokens;
  deviceId: string;
};

type OtpSentResult = {
  requiresOtp: true;
  purpose: OtpPurpose;
  expiresAt: string;
  otp?: string;
};

type RegistrationPayload = {
  passwordHash: string;
  displayName?: string;
  preferredCurrency?: string;
  device: DeviceInput;
};

function buildTokens(accessToken: string, refreshToken: string): AuthTokens {
  return {
    accessToken,
    refreshToken,
    accessTokenExpiresIn: config.auth.accessTokenTtlSeconds,
    tokenType: "Bearer",
  };
}

function asRegistrationPayload(payload: Record<string, unknown>): RegistrationPayload {
  const passwordHash = payload.passwordHash;
  const device = payload.device;

  if (typeof passwordHash !== "string" || !device || typeof device !== "object") {
    throw new AppError(400, "Registration challenge is invalid");
  }

  const typedDevice = device as DeviceInput;
  if (
    typeof typedDevice.deviceKey !== "string" ||
    (typedDevice.platform !== "android" &&
      typedDevice.platform !== "ios" &&
      typedDevice.platform !== "web")
  ) {
    throw new AppError(400, "Registration challenge device is invalid");
  }

  return {
    passwordHash,
    displayName:
      typeof payload.displayName === "string" ? payload.displayName : undefined,
    preferredCurrency:
      typeof payload.preferredCurrency === "string"
        ? payload.preferredCurrency
        : undefined,
    device: typedDevice,
  };
}

async function issueSession(
  input: {
    userId: string;
    phone: string;
    device: DeviceInput;
  },
  client?: PoolClient
): Promise<{ tokens: AuthTokens; deviceId: string }> {
  const device = await upsertDevice(
    {
      userId: input.userId,
      deviceKey: input.device.deviceKey,
      platform: input.device.platform,
      pushToken: input.device.pushToken,
      appVersion: input.device.appVersion,
    },
    client
  );

  const refreshToken = generateOpaqueToken();
  const tokenHash = hashToken(refreshToken);
  const expiresAt = addSeconds(new Date(), config.auth.refreshTokenTtlSeconds);

  const tokenRow = await createRefreshToken(
    {
      userId: input.userId,
      deviceId: device.id,
      tokenHash,
      expiresAt,
    },
    client
  );

  await setCachedSession(tokenHash, {
    userId: input.userId,
    deviceId: device.id,
    refreshTokenId: tokenRow.id,
    expiresAt: expiresAt.toISOString(),
  });

  return {
    deviceId: device.id,
    tokens: buildTokens(
      signAccessToken({ sub: input.userId, phone: input.phone }),
      refreshToken
    ),
  };
}

async function issueOtpChallenge(input: {
  phone: string;
  purpose: OtpPurpose;
  userId?: string | null;
  deviceKey?: string | null;
  payload?: Record<string, unknown>;
}): Promise<OtpSentResult> {
  const code = generateOtpCode();
  const expiresAt = addSeconds(new Date(), config.auth.otpTtlSeconds);

  await createOtpChallenge({
    phone: input.phone,
    purpose: input.purpose,
    codeHash: hashToken(code),
    userId: input.userId,
    deviceKey: input.deviceKey,
    payload: input.payload,
    expiresAt,
    maxAttempts: config.auth.otpMaxAttempts,
  });

  if (config.isDev) {
    logger.info(
      {
        purpose: input.purpose,
        phone: input.phone,
        ...(config.isDev ? { code } : { code: "[redacted]" }),
      },
      "otp_issued"
    );
  }

  return {
    requiresOtp: true,
    purpose: input.purpose,
    expiresAt: expiresAt.toISOString(),
    ...(config.isDev ? { otp: code } : {}),
  };
}

async function verifyOtpCode(input: {
  phone: string;
  purpose: OtpPurpose;
  code: string;
  client?: PoolClient;
}) {
  const challenge = await findActiveOtpChallenge(
    input.phone,
    input.purpose,
    input.client
  );

  if (!challenge) {
    throw new AppError(400, "No active OTP challenge found");
  }

  if (challenge.attempt_count >= challenge.max_attempts) {
    throw new AppError(429, "Too many invalid OTP attempts");
  }

  const matches = hashToken(input.code) === challenge.code_hash;
  if (!matches) {
    await incrementOtpAttempts(challenge.id, input.client);
    throw new AppError(400, "Invalid OTP code");
  }

  const consumed = await consumeOtpChallenge(challenge.id, input.client);
  if (!consumed) {
    throw new AppError(400, "OTP challenge expired");
  }

  return consumed;
}

export async function startRegistration(
  input: RegisterStartInput
): Promise<OtpSentResult> {
  const existing = await findActiveUserByPhone(input.phone);
  if (existing) {
    throw new AppError(409, "Phone number is already registered");
  }

  const passwordHash = await hashPassword(input.password);

  return issueOtpChallenge({
    phone: input.phone,
    purpose: "registration",
    payload: {
      passwordHash,
      displayName: input.displayName,
      preferredCurrency: input.preferredCurrency,
      device: input.device,
    },
  });
}

export async function verifyRegistration(
  input: RegisterVerifyInput
): Promise<AuthSessionResult> {
  return withTransaction(async (client) => {
    const challenge = await verifyOtpCode({
      phone: input.phone,
      purpose: "registration",
      code: input.code,
      client,
    });

    const existing = await findActiveUserByPhone(input.phone, client);
    if (existing) {
      throw new AppError(409, "Phone number is already registered");
    }

    const pending = asRegistrationPayload(challenge.payload);
    const device = input.device;

    const created = await createUser(
      {
        phone: input.phone,
        passwordHash: pending.passwordHash,
        displayName: pending.displayName,
        preferredCurrency: pending.preferredCurrency,
      },
      client
    );

    await createDefaultNotificationPreferences(created.id, client);

    const session = await issueSession(
      {
        userId: created.id,
        phone: created.phone,
        device,
      },
      client
    );

    return {
      user: toAuthUser(created),
      tokens: session.tokens,
      deviceId: session.deviceId,
    };
  });
}

export async function login(
  input: LoginInput
): Promise<AuthSessionResult | OtpSentResult> {
  const user = await findActiveUserByPhone(input.phone);
  if (!user) {
    await verifyPassword(input.password, TIMING_SAFE_DUMMY_HASH);
    throw new AppError(401, "Invalid phone number or password");
  }

  const passwordOk = await verifyPassword(input.password, user.password_hash);
  if (!passwordOk) {
    throw new AppError(401, "Invalid phone number or password");
  }

  const knownDevice = await findDeviceByUserAndKey(
    user.id,
    input.device.deviceKey
  );

  if (knownDevice) {
    const session = await issueSession({
      userId: user.id,
      phone: user.phone,
      device: input.device,
    });

    return {
      user: toAuthUser(user),
      tokens: session.tokens,
      deviceId: session.deviceId,
    };
  }

  return issueOtpChallenge({
    phone: user.phone,
    purpose: "new_device",
    userId: user.id,
    deviceKey: input.device.deviceKey,
    payload: {
      device: input.device,
    },
  });
}

export async function verifyNewDeviceLogin(
  input: LoginVerifyDeviceInput
): Promise<AuthSessionResult> {
  return withTransaction(async (client) => {
    const challenge = await verifyOtpCode({
      phone: input.phone,
      purpose: "new_device",
      code: input.code,
      client,
    });

    if (!challenge.user_id) {
      throw new AppError(400, "Invalid new-device challenge");
    }

    if (
      challenge.device_key &&
      challenge.device_key !== input.device.deviceKey
    ) {
      throw new AppError(400, "OTP was issued for a different device");
    }

    const user = await findActiveUserById(challenge.user_id, client);
    if (!user) {
      throw new AppError(401, "User not found or inactive");
    }

    const session = await issueSession(
      {
        userId: user.id,
        phone: user.phone,
        device: input.device,
      },
      client
    );

    return {
      user: toAuthUser(user),
      tokens: session.tokens,
      deviceId: session.deviceId,
    };
  });
}

export async function refresh(input: RefreshInput): Promise<AuthSessionResult> {
  return withTransaction(async (client) => {
    const oldHash = hashToken(input.refreshToken);
    const stored = await findActiveRefreshTokenByHash(oldHash, client);
    if (!stored) {
      throw new AppError(401, "Invalid or expired refresh token");
    }

    const user = await findActiveUserById(stored.user_id, client);
    if (!user || !stored.device_id) {
      await revokeRefreshTokenById(stored.id, client);
      await deleteCachedSession(oldHash);
      throw new AppError(401, "Invalid or expired refresh token");
    }

    await revokeRefreshTokenById(stored.id, client);
    await deleteCachedSession(oldHash);

    const nextRefreshToken = generateOpaqueToken();
    const nextHash = hashToken(nextRefreshToken);
    const expiresAt = addSeconds(new Date(), config.auth.refreshTokenTtlSeconds);

    const tokenRow = await createRefreshToken(
      {
        userId: user.id,
        deviceId: stored.device_id,
        tokenHash: nextHash,
        expiresAt,
      },
      client
    );

    await setCachedSession(nextHash, {
      userId: user.id,
      deviceId: stored.device_id,
      refreshTokenId: tokenRow.id,
      expiresAt: expiresAt.toISOString(),
    });

    return {
      user: toAuthUser(user),
      deviceId: stored.device_id,
      tokens: buildTokens(
        signAccessToken({ sub: user.id, phone: user.phone }),
        nextRefreshToken
      ),
    };
  });
}

export async function logout(
  input: LogoutInput,
  userId?: string
): Promise<{ revoked: boolean }> {
  if (input.allDevices) {
    if (!userId) {
      throw new AppError(401, "Authentication required to logout all devices");
    }
    await revokeRefreshTokensForUser(userId);
    return { revoked: true };
  }

  if (!input.refreshToken) {
    throw new AppError(400, "refreshToken is required unless allDevices is true");
  }

  const tokenHash = hashToken(input.refreshToken);
  const stored = await findActiveRefreshTokenByHash(tokenHash);
  if (!stored) {
    await deleteCachedSession(tokenHash);
    return { revoked: false };
  }

  if (userId && stored.user_id !== userId) {
    throw new AppError(403, "Refresh token does not belong to this user");
  }

  await revokeRefreshTokenById(stored.id);
  await deleteCachedSession(tokenHash);
  return { revoked: true };
}

export async function forgotPassword(
  input: ForgotPasswordInput
): Promise<OtpSentResult | { sent: true }> {
  const user = await findActiveUserByPhone(input.phone);
  if (!user) {
    return { sent: true };
  }

  return issueOtpChallenge({
    phone: user.phone,
    purpose: "password_reset",
    userId: user.id,
  });
}

export async function resetPassword(
  input: ResetPasswordInput
): Promise<{ reset: true }> {
  await withTransaction(async (client) => {
    const challenge = await verifyOtpCode({
      phone: input.phone,
      purpose: "password_reset",
      code: input.code,
      client,
    });

    if (!challenge.user_id) {
      throw new AppError(400, "Invalid password-reset challenge");
    }

    const passwordHash = await hashPassword(input.password);
    await updatePasswordHash(challenge.user_id, passwordHash, client);
    await revokeRefreshTokensForUser(challenge.user_id, client);
  });

  return { reset: true };
}

export async function resendOtp(input: ResendOtpInput): Promise<OtpSentResult> {
  const active = await findActiveOtpChallenge(input.phone, input.purpose);
  if (!active) {
    throw new AppError(400, "No active OTP challenge to resend");
  }

  return issueOtpChallenge({
    phone: active.phone,
    purpose: active.purpose,
    userId: active.user_id,
    deviceKey: active.device_key,
    payload: active.payload,
  });
}

export async function deleteAccount(userId: string): Promise<{ deleted: true }> {
  await withTransaction(async (client) => {
    const deleted = await softDeleteUser(userId, client);
    if (!deleted) {
      throw new AppError(404, "User not found");
    }
    await revokeRefreshTokensForUser(userId, client);
  });

  return { deleted: true };
}

export async function getCurrentUser(userId: string): Promise<AuthUser> {
  const user = await findActiveUserById(userId);
  if (!user) {
    throw new AppError(404, "User not found");
  }
  return toAuthUser(user);
}
