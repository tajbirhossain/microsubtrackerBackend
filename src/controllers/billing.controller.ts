import type { Request, Response } from "express";
import * as billingService from "../billing/billing.service.js";
import { AppError } from "../utils/errors.js";
import type { CheckoutBody, ConfirmBody } from "../schemas/billing.schemas.js";

export async function startCheckout(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    throw new AppError(401, "Unauthorized");
  }

  const body = req.body as CheckoutBody;
  const result = await billingService.startCheckout({
    userId: user.id,
    email: user.email,
    plan: body.plan,
  });

  res.status(201).json({
    success: true,
    data: result,
  });
}

export async function confirmCheckout(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    throw new AppError(401, "Unauthorized");
  }

  const body = req.body as ConfirmBody;
  const result = await billingService.confirmCheckout({
    userId: user.id,
    transactionId: body.transactionId,
  });

  res.json({
    success: true,
    data: result,
  });
}

export async function getStatus(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    throw new AppError(401, "Unauthorized");
  }

  const status = await billingService.getBillingStatus(user.id);
  res.json({
    success: true,
    data: status,
  });
}

export async function handleWebhook(req: Request, res: Response): Promise<void> {
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!rawBody || !Buffer.isBuffer(rawBody)) {
    throw new AppError(400, "Missing raw webhook body");
  }

  const result = await billingService.handlePaddleWebhook({
    rawBody,
    signatureHeader: req.header("paddle-signature") ?? undefined,
  });

  res.json({ success: true, data: result });
}
