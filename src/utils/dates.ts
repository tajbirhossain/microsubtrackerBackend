/** Calendar-day difference (UTC date parts). Negative if `to` is before `from`. */
export function calendarDaysBetween(from: Date | string, to: Date | string = new Date()): number {
  const start = typeof from === "string" ? new Date(from) : from;
  const end = typeof to === "string" ? new Date(to) : to;

  const utcStart = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate()
  );
  const utcEnd = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());

  return Math.floor((utcEnd - utcStart) / 86_400_000);
}

export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  return calendarDaysBetween(new Date(), date);
}

export function liveUnusedDays(
  lastUsedAt: string | null,
  createdAt: string
): number {
  return Math.max(0, calendarDaysBetween(lastUsedAt ?? createdAt, new Date()));
}

/** Normalize pg DATE / Date / ISO string to YYYY-MM-DD for the mobile client. */
export function toDateKey(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
    if (match?.[1]) return match[1];
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
  }
  if (Number.isNaN(value.getTime())) return null;
  const y = value.getUTCFullYear();
  const m = `${value.getUTCMonth() + 1}`.padStart(2, "0");
  const d = `${value.getUTCDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}
