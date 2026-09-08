import type { Queryable } from "../db/query.js";
import { queryOne } from "../db/query.js";
import type { DeviceRow } from "../types/database.js";
import type { DevicePlatform } from "../types/index.js";

export type UpsertDeviceInput = {
  userId: string;
  deviceKey: string;
  platform: DevicePlatform;
  pushToken?: string;
  appVersion?: string;
};

export async function upsertDevice(
  input: UpsertDeviceInput,
  client?: Queryable
): Promise<DeviceRow> {
  const device = await queryOne<DeviceRow>(
    `
      INSERT INTO devices (
        user_id,
        device_key,
        platform,
        push_token,
        app_version,
        last_seen_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (user_id, device_key)
      DO UPDATE SET
        platform = EXCLUDED.platform,
        push_token = COALESCE(EXCLUDED.push_token, devices.push_token),
        app_version = COALESCE(EXCLUDED.app_version, devices.app_version),
        last_seen_at = NOW()
      RETURNING *
    `,
    [
      input.userId,
      input.deviceKey,
      input.platform,
      input.pushToken ?? null,
      input.appVersion ?? null,
    ],
    client
  );

  if (!device) {
    throw new Error("Failed to upsert device");
  }

  return device;
}

export async function findDeviceByUserAndKey(
  userId: string,
  deviceKey: string,
  client?: Queryable
): Promise<DeviceRow | null> {
  return queryOne<DeviceRow>(
    `
      SELECT *
      FROM devices
      WHERE user_id = $1
        AND device_key = $2
      LIMIT 1
    `,
    [userId, deviceKey],
    client
  );
}
