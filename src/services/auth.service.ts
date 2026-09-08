import type { PoolClient } from "pg";
import config from "../config/index.js";
import { withTransaction } from "../db/transaction.js";
import {
  consumeEmailVerificationToken,
  consumePasswordResetToken,
  createEmailVerificationToken,
  createPasswordResetToken,
} from "../repositories/auth-token.repository.js";
import { upsertDevice } from "../repositories/device.repository.js";
import { createDefaultNotificationPreferences } from "../repositories/notification-preferences.repository.js";
import {
  createRefreshToken,
  findActiveRefreshTokenByHash,
  revokeRefreshTokenById,
  revokeRefreshTokensForUser,
} from "../repositories/refresh-token.repository.js";
import {
  createUser,
  findActiveUserByEmail,
  findActiveUserById,
  markEmailVerified,
  softDeleteUser,
  updatePasswordHash,
} from "../repositories/user.repository.js";
import type {
  DeviceInput,
  LoginInput,
  LogoutInput,
  RefreshInput,
  RegisterInput,
} from "../schemas/auth.schemas.js";
import type { AuthTokens, AuthUser } from "../types/index.js";
import { AppError } from "../utils/errors.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import {
  addSeconds,
  generateOpaqueToken,
  hashToken,
  signAccessToken,
} from "../utils/tokens.js";
import { toAuthUser } from "./auth.mapper.js";

type AuthSessionResult = {
  user: AuthUser;
  tokens: AuthTokens;
  deviceId: string;
};

type DevTokenPayload = {
  token: string;
  expiresAt: string;
};

function buildTokens(accessToken: string, refreshToken: string): AuthTokens {
  return {
    accessToken,
    refreshToken,
    accessTokenExpiresIn: config.auth.accessTokenTtlSeconds,
    tokenType: "Bearer",
  };
}

async function issueSession(
  input: {
    userId: string;
    email: string;
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
  const expiresAt = addSeconds(new Date(), config.auth.refreshTokenTtlSeconds);

  await createRefreshToken(
    {
      userId: input.userId,
      deviceId: device.id,
      tokenHash: hashToken(refreshToken),
      expiresAt,
    },
    client
  );

  return {
    deviceId: device.id,
    tokens: buildTokens(
      signAccessToken({ sub: input.userId, email: input.email }),
      refreshToken
    ),
  };
}

function logDevToken(
  kind: "email-verification" | "password-reset",
  token: string
): void {
  if (!config.isDev) {
    return;
  }
  console.info(`[auth:${kind}] ${token}`);
}

export async function register(input: RegisterInput): Promise<
  AuthSessionResult & { verification?: DevTokenPayload }
> {
  const existing = await findActiveUserByEmail(input.email);
  if (existing) {
    throw new AppError(409, "Email is already registered");
  }

  const passwordHash = await hashPassword(input.password);
  const verificationToken = generateOpaqueToken();
  const verificationExpiresAt = addSeconds(
    new Date(),
    config.auth.emailVerificationTtlSeconds
  );

  const result = await withTransaction(async (client) => {
    const created = await createUser(
      {
        email: input.email,
        passwordHash,
        displayName: input.displayName,
        preferredCurrency: input.preferredCurrency,
      },
      client
    );

    await createDefaultNotificationPreferences(created.id, client);
    await createEmailVerificationToken(
      {
        userId: created.id,
        tokenHash: hashToken(verificationToken),
        expiresAt: verificationExpiresAt,
      },
      client
    );

    const session = await issueSession(
      {
        userId: created.id,
        email: created.email,
        device: input.device,
      },
      client
    );

    return {
      user: toAuthUser(created),
      tokens: session.tokens,
      deviceId: session.deviceId,
    };
  });

  logDevToken("email-verification", verificationToken);

  return {
    ...result,
    ...(config.isDev
      ? {
          verification: {
            token: verificationToken,
            expiresAt: verificationExpiresAt.toISOString(),
          },
        }
      : {}),
  };
}

export async function login(input: LoginInput): Promise<AuthSessionResult> {
  const user = await findActiveUserByEmail(input.email);
  if (!user) {
    throw new AppError(401, "Invalid email or password");
  }

  const passwordOk = await verifyPassword(input.password, user.password_hash);
  if (!passwordOk) {
    throw new AppError(401, "Invalid email or password");
  }

  const session = await issueSession({
    userId: user.id,
    email: user.email,
    device: input.device,
  });

  return {
    user: toAuthUser(user),
    tokens: session.tokens,
    deviceId: session.deviceId,
  };
}

export async function refresh(input: RefreshInput): Promise<AuthSessionResult> {
  return withTransaction(async (client) => {
    const stored = await findActiveRefreshTokenByHash(
      hashToken(input.refreshToken),
      client
    );
    if (!stored) {
      throw new AppError(401, "Invalid or expired refresh token");
    }

    const user = await findActiveUserById(stored.user_id, client);
    if (!user || !stored.device_id) {
      await revokeRefreshTokenById(stored.id, client);
      throw new AppError(401, "Invalid or expired refresh token");
    }

    await revokeRefreshTokenById(stored.id, client);

    const nextRefreshToken = generateOpaqueToken();
    const expiresAt = addSeconds(new Date(), config.auth.refreshTokenTtlSeconds);

    await createRefreshToken(
      {
        userId: user.id,
        deviceId: stored.device_id,
        tokenHash: hashToken(nextRefreshToken),
        expiresAt,
      },
      client
    );

    return {
      user: toAuthUser(user),
      deviceId: stored.device_id,
      tokens: buildTokens(
        signAccessToken({ sub: user.id, email: user.email }),
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

  const stored = await findActiveRefreshTokenByHash(hashToken(input.refreshToken));
  if (!stored) {
    return { revoked: false };
  }

  if (userId && stored.user_id !== userId) {
    throw new AppError(403, "Refresh token does not belong to this user");
  }

  await revokeRefreshTokenById(stored.id);
  return { revoked: true };
}

export async function verifyEmail(token: string): Promise<AuthUser> {
  const consumed = await consumeEmailVerificationToken(hashToken(token));
  if (!consumed) {
    throw new AppError(400, "Invalid or expired verification token");
  }

  const user = await markEmailVerified(consumed.user_id);
  if (!user) {
    throw new AppError(404, "User not found");
  }

  return toAuthUser(user);
}

export async function resendVerification(email: string): Promise<{
  sent: boolean;
  verification?: DevTokenPayload;
}> {
  const user = await findActiveUserByEmail(email);
  if (!user || user.email_verified_at) {
    return { sent: true };
  }

  const token = generateOpaqueToken();
  const expiresAt = addSeconds(
    new Date(),
    config.auth.emailVerificationTtlSeconds
  );

  await createEmailVerificationToken({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt,
  });

  logDevToken("email-verification", token);

  return {
    sent: true,
    ...(config.isDev
      ? {
          verification: {
            token,
            expiresAt: expiresAt.toISOString(),
          },
        }
      : {}),
  };
}

export async function forgotPassword(email: string): Promise<{
  sent: boolean;
  reset?: DevTokenPayload;
}> {
  const user = await findActiveUserByEmail(email);
  if (!user) {
    return { sent: true };
  }

  const token = generateOpaqueToken();
  const expiresAt = addSeconds(new Date(), config.auth.passwordResetTtlSeconds);

  await createPasswordResetToken({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt,
  });

  logDevToken("password-reset", token);

  return {
    sent: true,
    ...(config.isDev
      ? {
          reset: {
            token,
            expiresAt: expiresAt.toISOString(),
          },
        }
      : {}),
  };
}

export async function resetPassword(
  token: string,
  password: string
): Promise<{ reset: true }> {
  await withTransaction(async (client) => {
    const consumed = await consumePasswordResetToken(hashToken(token), client);
    if (!consumed) {
      throw new AppError(400, "Invalid or expired reset token");
    }

    const passwordHash = await hashPassword(password);
    await updatePasswordHash(consumed.user_id, passwordHash, client);
    await revokeRefreshTokensForUser(consumed.user_id, client);
  });

  return { reset: true };
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
