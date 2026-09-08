import type { Request, Response } from "express";
import { runIdempotent } from "../redis/idempotency.js";
import * as subscriptionService from "../services/subscription.service.js";

function idempotencyKey(req: Request): string | undefined {
  const value = req.header("idempotency-key") ?? req.header("Idempotency-Key");
  return value?.trim() || undefined;
}

export async function createSubscription(
  req: Request,
  res: Response
): Promise<void> {
  const result = await runIdempotent({
    userId: req.user!.id,
    key: idempotencyKey(req),
    method: "POST",
    path: "/api/subscriptions",
    requestBody: req.body,
    handler: async () => {
      const subscription = await subscriptionService.createUserSubscription(
        req.user!.id,
        req.body
      );
      return {
        statusCode: 201,
        body: {
          success: true,
          message: "Subscription created",
          data: { subscription },
        },
      };
    },
  });

  if (result.replayed) {
    res.setHeader("Idempotent-Replayed", "true");
  }
  res.status(result.statusCode).json(result.body);
}

export async function listSubscriptions(
  req: Request,
  res: Response
): Promise<void> {
  const result = await subscriptionService.listUserSubscriptions(
    req.user!.id,
    req.query as never
  );

  res.json({
    success: true,
    data: result,
  });
}

export async function getSubscription(
  req: Request,
  res: Response
): Promise<void> {
  const subscriptionId = String(req.params.id);
  const subscription = await subscriptionService.getUserSubscription(
    req.user!.id,
    subscriptionId
  );

  res.json({
    success: true,
    data: { subscription },
  });
}

export async function updateSubscription(
  req: Request,
  res: Response
): Promise<void> {
  const subscriptionId = String(req.params.id);
  const subscription = await subscriptionService.updateUserSubscription(
    req.user!.id,
    subscriptionId,
    req.body
  );

  res.json({
    success: true,
    message: "Subscription updated",
    data: { subscription },
  });
}

export async function deleteSubscription(
  req: Request,
  res: Response
): Promise<void> {
  const subscriptionId = String(req.params.id);

  const result = await runIdempotent({
    userId: req.user!.id,
    key: idempotencyKey(req),
    method: "DELETE",
    path: `/api/subscriptions/${subscriptionId}`,
    requestBody: { ...req.body, id: subscriptionId },
    handler: async () => {
      const subscription = await subscriptionService.deleteUserSubscription(
        req.user!.id,
        subscriptionId,
        req.body.cancellationNotes,
        req.body.version
      );
      return {
        statusCode: 200,
        body: {
          success: true,
          message: "Subscription cancelled",
          data: { subscription },
        },
      };
    },
  });

  if (result.replayed) {
    res.setHeader("Idempotent-Replayed", "true");
  }
  res.status(result.statusCode).json(result.body);
}

export async function getUpcoming(req: Request, res: Response): Promise<void> {
  const days = Number(req.query.days ?? 30);
  const result = await subscriptionService.getUpcomingSubscriptions(
    req.user!.id,
    days
  );

  res.json({
    success: true,
    data: result,
  });
}

export async function getCalendar(req: Request, res: Response): Promise<void> {
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  const result = await subscriptionService.getCalendarSubscriptions(
    req.user!.id,
    year,
    month
  );

  res.json({
    success: true,
    data: result,
  });
}

export async function getBurnRate(req: Request, res: Response): Promise<void> {
  const result = await subscriptionService.getBurnRate(req.user!.id);

  res.json({
    success: true,
    data: result,
  });
}
