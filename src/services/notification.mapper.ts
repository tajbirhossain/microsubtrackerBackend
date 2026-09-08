import type { NotificationPreferencesRow } from "../types/database.js";
import type { UpdatePreferencesInput } from "../schemas/notification.schemas.js";

export type NotificationPreferencesView = {
  renewalsEnabled: boolean;
  trialsEnabled: boolean;
  unusedEnabled: boolean;
  weeklySummaryEnabled: boolean;
  upcomingWeekEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string;
  updatedAt: string;
};

export function toPreferencesView(
  row: NotificationPreferencesRow
): NotificationPreferencesView {
  return {
    renewalsEnabled: row.renewals_enabled,
    trialsEnabled: row.trials_enabled,
    unusedEnabled: row.unused_enabled,
    weeklySummaryEnabled: row.weekly_summary_enabled,
    upcomingWeekEnabled: row.upcoming_week_enabled,
    quietHoursStart: row.quiet_hours_start
      ? String(row.quiet_hours_start).slice(0, 8)
      : null,
    quietHoursEnd: row.quiet_hours_end
      ? String(row.quiet_hours_end).slice(0, 8)
      : null,
    timezone: row.timezone,
    updatedAt: row.updated_at.toISOString(),
  };
}

export function toPreferencesUpdateInput(input: UpdatePreferencesInput) {
  return {
    renewalsEnabled: input.renewalsEnabled,
    trialsEnabled: input.trialsEnabled,
    unusedEnabled: input.unusedEnabled,
    weeklySummaryEnabled: input.weeklySummaryEnabled,
    upcomingWeekEnabled: input.upcomingWeekEnabled,
    quietHoursStart: input.quietHoursStart,
    quietHoursEnd: input.quietHoursEnd,
    timezone: input.timezone,
  };
}
