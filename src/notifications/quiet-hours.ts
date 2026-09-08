import type { NotificationPreferencesRow } from "../types/database.js";

function parseTimeToMinutes(value: string): number {
  const [hours = 0, minutes = 0] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function zonedMinutesNow(timeZone: string, now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  // en-GB can emit "24" for midnight in some engines
  return ((hour % 24) * 60) + minute;
}

/** True when local time sits inside [start, end), including overnight windows. */
export function isInQuietHours(
  prefs: Pick<
    NotificationPreferencesRow,
    "quiet_hours_start" | "quiet_hours_end" | "timezone"
  >,
  now = new Date()
): boolean {
  if (!prefs.quiet_hours_start || !prefs.quiet_hours_end) {
    return false;
  }

  const start = parseTimeToMinutes(prefs.quiet_hours_start);
  const end = parseTimeToMinutes(prefs.quiet_hours_end);
  const current = zonedMinutesNow(prefs.timezone || "UTC", now);

  if (start === end) {
    return false;
  }

  if (start < end) {
    return current >= start && current < end;
  }

  return current >= start || current < end;
}

/** Milliseconds until quiet hours end in the user's timezone; 0 if not quiet. */
export function msUntilQuietHoursEnd(
  prefs: Pick<
    NotificationPreferencesRow,
    "quiet_hours_start" | "quiet_hours_end" | "timezone"
  >,
  now = new Date()
): number {
  if (!isInQuietHours(prefs, now) || !prefs.quiet_hours_end) {
    return 0;
  }

  const endMinutes = parseTimeToMinutes(prefs.quiet_hours_end);
  const current = zonedMinutesNow(prefs.timezone || "UTC", now);
  let delta = endMinutes - current;
  if (delta <= 0) {
    delta += 24 * 60;
  }

  // Add 30s buffer so we don't land exactly on the boundary.
  return delta * 60_000 + 30_000;
}
