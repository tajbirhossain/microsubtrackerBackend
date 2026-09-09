import * as analyticsRepo from "../repositories/analytics-event.repository.js";
import type { FunnelQueryInput, TrackAnalyticsEventInput } from "../schemas/analytics.schemas.js";
import {
  ONBOARDING_FUNNEL_STEPS,
  ONBOARDING_STEP_ALIASES,
  type OnboardingFunnelStep,
} from "../types/index.js";
import { AppError } from "../utils/errors.js";
import { toAnalyticsEventView, type AnalyticsEventView } from "./analytics.mapper.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function normalizeOnboardingStep(step: string): string {
  return ONBOARDING_STEP_ALIASES[step] ?? step;
}

function resolveDateRange(query: FunnelQueryInput): {
  from: Date;
  to: Date;
  fromIso: string;
  toIso: string;
} {
  const now = new Date();
  let from: Date;
  let to: Date;

  if (query.from || query.to) {
    from = query.from ? new Date(query.from) : new Date(now.getTime() - 30 * MS_PER_DAY);
    to = query.to ? new Date(query.to) : now;
  } else {
    const days = query.days ?? 30;
    to = now;
    from = new Date(now.getTime() - days * MS_PER_DAY);
  }

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new AppError(400, "Invalid from/to date");
  }
  if (from >= to) {
    throw new AppError(400, "`from` must be earlier than `to`");
  }

  return {
    from,
    to,
    fromIso: from.toISOString(),
    toIso: to.toISOString(),
  };
}

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Math.round((numerator / denominator) * 10000) / 100;
}

export async function trackEvent(
  userId: string | undefined,
  input: TrackAnalyticsEventInput
): Promise<AnalyticsEventView> {
  if (!userId && !input.anonymousId) {
    throw new AppError(
      400,
      "anonymousId is required when the request is not authenticated"
    );
  }

  const step =
    input.funnel === "onboarding"
      ? normalizeOnboardingStep(input.step)
      : input.step === "paywall"
        ? "plan"
        : input.step;

  const row = await analyticsRepo.createAnalyticsEvent({
    sessionId: input.sessionId,
    userId: userId ?? null,
    anonymousId: input.anonymousId ?? null,
    deviceKey: input.deviceKey ?? null,
    funnel: input.funnel,
    step,
    action: input.action,
    properties: {
      ...(input.properties ?? {}),
      ...(input.step !== step ? { clientStep: input.step } : {}),
    },
  });

  return toAnalyticsEventView(row);
}

export type OnboardingFunnelStepStat = {
  step: OnboardingFunnelStep;
  ordinal: number;
  reached: number;
  droppedHere: number;
  dropRatePercent: number;
  continueRatePercent: number;
};

export type OnboardingFunnelResult = {
  range: { from: string; to: string };
  totalSessions: number;
  completed: number;
  completionRatePercent: number;
  steps: OnboardingFunnelStepStat[];
};

export async function getOnboardingFunnel(
  query: FunnelQueryInput
): Promise<OnboardingFunnelResult> {
  const range = resolveDateRange(query);
  const sessions = await analyticsRepo.listOnboardingSessionMaxSteps(range);

  const totalSessions = sessions.length;
  const completed = sessions.filter((s) => s.max_ordinal >= 10).length;

  const steps: OnboardingFunnelStepStat[] = ONBOARDING_FUNNEL_STEPS.map(
    (step, index) => {
      const ordinal = index + 1;
      const reached = sessions.filter((s) => s.max_ordinal >= ordinal).length;
      const droppedHere = sessions.filter((s) => s.max_ordinal === ordinal).length;
      const continued = sessions.filter((s) => s.max_ordinal > ordinal).length;

      return {
        step,
        ordinal,
        reached,
        droppedHere,
        dropRatePercent: rate(droppedHere, reached),
        continueRatePercent: rate(continued, reached),
      };
    }
  );

  return {
    range: { from: range.fromIso, to: range.toIso },
    totalSessions,
    completed,
    completionRatePercent: rate(completed, totalSessions),
    steps,
  };
}

export type PaywallFunnelResult = {
  range: { from: string; to: string };
  viewed: number;
  startedCheckout: number;
  paid: number;
  dismissedWithoutPaying: number;
  droppedWithoutPaying: number;
  dropRatePercent: number;
  conversionRatePercent: number;
  checkoutConversionRatePercent: number;
};

export async function getPaywallFunnel(
  query: FunnelQueryInput
): Promise<PaywallFunnelResult> {
  const range = resolveDateRange(query);
  const counts = await analyticsRepo.getPaywallCohortCounts(range);

  const viewed = Number(counts.viewed);
  const paid = Number(counts.paid);
  const dismissedWithoutPaying = Number(counts.dismissed_without_pay);
  const startedCheckout = Number(counts.started_checkout);
  const droppedWithoutPaying = Math.max(viewed - paid, 0);

  return {
    range: { from: range.fromIso, to: range.toIso },
    viewed,
    startedCheckout,
    paid,
    dismissedWithoutPaying,
    droppedWithoutPaying,
    dropRatePercent: rate(droppedWithoutPaying, viewed),
    conversionRatePercent: rate(paid, viewed),
    checkoutConversionRatePercent: rate(paid, startedCheckout),
  };
}
