import type { NextFunction, Request, Response } from "express";
import { findActiveUserById } from "../repositories/user.repository.js";
import { toAuthUser } from "../services/auth.mapper.js";
import { AppError } from "../utils/errors.js";
import { verifyAccessToken } from "../utils/tokens.js";
import { userRateLimit } from "./rateLimit.js";

declare global {
  namespace Express {
    interface Request {
      user?: import("../types/index.js").AuthUser;
      accessToken?: string;
    }
  }
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

async function attachUserFromAccessToken(req: Request): Promise<void> {
  const token = extractBearerToken(req.header("authorization"));
  if (!token) {
    throw new AppError(401, "Authentication required");
  }

  const payload = verifyAccessToken(token);
  const user = await findActiveUserById(payload.sub);

  if (!user) {
    throw new AppError(401, "User not found or inactive");
  }

  req.accessToken = token;
  req.user = toAuthUser(user);
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await attachUserFromAccessToken(req);
    await userRateLimit()(req, res, next);
  } catch (error) {
    next(error);
  }
}

export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractBearerToken(req.header("authorization"));
    if (!token) {
      next();
      return;
    }

    await attachUserFromAccessToken(req);
    next();
  } catch {
    next();
  }
}
