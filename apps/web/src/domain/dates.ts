/**
 * Return the diary date (YYYY-MM-DD) of an instant in the given IANA time zone.
 *
 * A meal eaten at 00:30 in Kuala Lumpur belongs to that local day, even though
 * the same instant is still the previous day in UTC.
 */
export function localDateIn(zone: string, instant: Date): string {
  // en-CA formats dates as YYYY-MM-DD, which is also the stored diary-date format
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/**
 * Return the diary date a number of days before or after the given one.
 *
 * Done on the calendar date at noon UTC, so daylight-saving changes in the
 * device's zone can never skip or repeat a day.
 */
export function addDays(date: string, days: number): string {
  const moved = new Date(`${date}T12:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

/**
 * Return the device's IANA time zone, e.g. "Asia/Kuala_Lumpur".
 */
export function deviceZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
