import type { AnalyticsEventRow } from "../types/database.js";
import type { AnalyticsAction, AnalyticsFunnel } from "../types/index.js";

export type AnalyticsEventView = {
  id: string;
  sessionId: string;
  userId: string | null;
  anonymousId: string | null;
  deviceKey: string | null;
  funnel: AnalyticsFunnel;
  step: string;
  action: AnalyticsAction;
  properties: Record<string, unknown>;
  createdAt: string;
};

export function toAnalyticsEventView(row: AnalyticsEventRow): AnalyticsEventView {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    anonymousId: row.anonymous_id,
    deviceKey: row.device_key,
    funnel: row.funnel,
    step: row.step,
    action: row.action,
    properties: row.properties ?? {},
    createdAt: row.created_at.toISOString(),
  };
}
