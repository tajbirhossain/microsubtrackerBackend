import type { Request, Response } from "express";
import * as billingService from "../billing/billing.service.js";
import { AppError } from "../utils/errors.js";
import type { GoogleConfirmBody } from "../schemas/billing.schemas.js";

export async function confirmGooglePurchase(
  req: Request,
  res: Response
): Promise<void> {
  const user = req.user;
  if (!user) {
    throw new AppError(401, "Unauthorized");
  }

  const body = req.body as GoogleConfirmBody;
  const result = await billingService.confirmGooglePurchase({
    userId: user.id,
    productId: body.productId,
    purchaseToken: body.purchaseToken,
    packageName: body.packageName,
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
