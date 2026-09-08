import type { Queryable } from "../db/query.js";
import { query } from "../db/query.js";

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
