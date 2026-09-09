import type { Request, Response } from "express";
import type { FunnelQueryInput, TrackAnalyticsEventInput } from "../schemas/analytics.schemas.js";
import * as analyticsService from "../services/analytics.service.js";

export async function trackEvent(req: Request, res: Response): Promise<void> {
  const event = await analyticsService.trackEvent(
    req.user?.id,
    req.body as TrackAnalyticsEventInput
  );

  res.status(201).json({
    success: true,
    message: "Analytics event recorded",
    data: { event },
  });
}

export async function getOnboardingFunnel(
  req: Request,
  res: Response
): Promise<void> {
  const data = await analyticsService.getOnboardingFunnel(
    req.query as FunnelQueryInput
  );

  res.json({
    success: true,
    data,
  });
}

export async function getPaywallFunnel(
  req: Request,
  res: Response
): Promise<void> {
  const data = await analyticsService.getPaywallFunnel(
    req.query as FunnelQueryInput
  );

  res.json({
    success: true,
    data,
  });
}
