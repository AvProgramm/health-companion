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
 * Return the device's IANA time zone, e.g. "Asia/Kuala_Lumpur".
 */
export function deviceZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
