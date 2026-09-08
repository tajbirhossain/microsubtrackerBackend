import type { Request, Response } from "express";
import config from "../config/index.js";
import { enqueueNotification } from "../jobs/producers.js";
import * as notificationService from "../services/notification.service.js";
import { AppError } from "../utils/errors.js";

export async function getPreferences(
  req: Request,
  res: Response
): Promise<void> {
  const preferences = await notificationService.getPreferences(req.user!.id);
  res.json({
    success: true,
    data: { preferences },
  });
}

export async function updatePreferences(
  req: Request,
  res: Response
): Promise<void> {
  const preferences = await notificationService.updatePreferences(
    req.user!.id,
    req.body
  );
  res.json({
    success: true,
    message: "Notification preferences updated",
    data: { preferences },
  });
}

export async function registerPushToken(
  req: Request,
  res: Response
): Promise<void> {
  const result = await notificationService.registerPushToken(
    req.user!.id,
    req.body
  );
  res.json({
    success: true,
    message: result.pushTokenRegistered
      ? "Push token registered"
      : "Push token cleared",
    data: result,
  });
}

export async function listDeliveries(
  req: Request,
  res: Response
): Promise<void> {
  const items = await notificationService.listNotificationHistory(
    req.user!.id,
    req.query as never
  );
  res.json({
    success: true,
    data: { items },
  });
}

export async function sendTestNotification(
  req: Request,
  res: Response
): Promise<void> {
  if (!config.isDev) {
    throw new AppError(403, "Test notifications are only available in development");
  }

  const payload = await notificationService.enqueueTestNotification(
    req.user!.id,
    req.body
  );
  await enqueueNotification(payload);

  res.status(202).json({
    success: true,
    message: "Test notification enqueued",
    data: { notification: payload },
  });
}
