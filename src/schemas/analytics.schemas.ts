import { z } from "zod";
import { ONBOARDING_FUNNEL_STEPS } from "../types/index.js";

const uuidSchema = z.string().uuid();

const onboardingStepValues = [
  ...ONBOARDING_FUNNEL_STEPS,
  "phone",
  "login",
] as const;

export const trackAnalyticsEventSchema = z
  .object({
    sessionId: uuidSchema,
    anonymousId: z.string().trim().min(8).max(128).optional(),
    deviceKey: z.string().trim().min(1).max(255).optional(),
    funnel: z.enum(["onboarding", "paywall"]),
    step: z.string().trim().min(1).max(64),
    action: z.enum([
      "viewed",
      "completed",
      "skipped",
      "purchase_started",
      "purchase_completed",
      "dismissed",
    ]),
    properties: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.funnel === "onboarding") {
      if (
        !(onboardingStepValues as readonly string[]).includes(value.step)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["step"],
          message: `Invalid onboarding step. Expected one of: ${onboardingStepValues.join(", ")}`,
        });
      }
      return;
    }

    if (value.step !== "plan" && value.step !== "paywall") {
      ctx.addIssue({
        code: "custom",
        path: ["step"],
        message: "Paywall funnel step must be plan or paywall",
      });
    }
  });

export const funnelQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  days: z.coerce.number().int().min(1).max(365).optional(),
});

export type TrackAnalyticsEventInput = z.infer<typeof trackAnalyticsEventSchema>;
export type FunnelQueryInput = z.infer<typeof funnelQuerySchema>;
