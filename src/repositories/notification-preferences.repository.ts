import type { Queryable } from "../db/query.js";
import { query, queryAll, queryOne } from "../db/query.js";
import type { NotificationPreferencesRow } from "../types/database.js";

export type UpdateNotificationPreferencesInput = {
  renewalsEnabled?: boolean;
  trialsEnabled?: boolean;
  unusedEnabled?: boolean;
  weeklySummaryEnabled?: boolean;
  upcomingWeekEnabled?: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  timezone?: string;
};

export async function createDefaultNotificationPreferences(
  userId: string,
  client?: Queryable
): Promise<void> {
  await query(
    `
      INSERT INTO notification_preferences (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING
    `,
    [userId],
    client
  );
}

export async function findPreferencesForUser(
  userId: string,
  client?: Queryable
): Promise<NotificationPreferencesRow | null> {
  return queryOne<NotificationPreferencesRow>(
    `
      SELECT *
      FROM notification_preferences
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId],
    client
  );
}

export async function getOrCreatePreferencesForUser(
  userId: string,
  client?: Queryable
): Promise<NotificationPreferencesRow> {
  await createDefaultNotificationPreferences(userId, client);
  const row = await findPreferencesForUser(userId, client);
  if (!row) {
    throw new Error("Failed to load notification preferences");
  }
  return row;
}

export async function updatePreferencesForUser(
  userId: string,
  input: UpdateNotificationPreferencesInput,
  client?: Queryable
): Promise<NotificationPreferencesRow> {
  await createDefaultNotificationPreferences(userId, client);

  const sets: string[] = [];
  const params: unknown[] = [];

  const add = (column: string, value: unknown) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };

  if (input.renewalsEnabled !== undefined) {
    add("renewals_enabled", input.renewalsEnabled);
  }
  if (input.trialsEnabled !== undefined) {
    add("trials_enabled", input.trialsEnabled);
  }
  if (input.unusedEnabled !== undefined) {
    add("unused_enabled", input.unusedEnabled);
  }
  if (input.weeklySummaryEnabled !== undefined) {
    add("weekly_summary_enabled", input.weeklySummaryEnabled);
  }
  if (input.upcomingWeekEnabled !== undefined) {
    add("upcoming_week_enabled", input.upcomingWeekEnabled);
  }
  if (input.quietHoursStart !== undefined) {
    add("quiet_hours_start", input.quietHoursStart);
  }
  if (input.quietHoursEnd !== undefined) {
    add("quiet_hours_end", input.quietHoursEnd);
  }
  if (input.timezone !== undefined) {
    add("timezone", input.timezone);
  }

  if (sets.length === 0) {
    return getOrCreatePreferencesForUser(userId, client);
  }

  params.push(userId);
  const row = await queryOne<NotificationPreferencesRow>(
    `
      UPDATE notification_preferences
      SET ${sets.join(", ")}
      WHERE user_id = $${params.length}
      RETURNING *
    `,
    params,
    client
  );

  if (!row) {
    throw new Error("Failed to update notification preferences");
  }

  return row;
}

export async function listUsersWithPreferenceEnabled(
  column:
    | "weekly_summary_enabled"
    | "upcoming_week_enabled",
  client?: Queryable
): Promise<string[]> {
  const rows = await queryAll<{ user_id: string }>(
    `
      SELECT user_id
      FROM notification_preferences
      WHERE ${column} = TRUE
    `,
    [],
    client
  );
  return rows.map((row) => row.user_id);
}
