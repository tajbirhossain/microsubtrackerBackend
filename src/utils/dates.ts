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
