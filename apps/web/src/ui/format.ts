import type { NutrientTotal } from '../domain/aggregate';

/**
 * Return a nutrient total as display text, e.g. "110.8 kcal" or "0 g + 1 unknown".
 *
 * Rounding happens only here, so stored values keep full precision.
 */
export function formatTotal(total: NutrientTotal, unit: string, digits = 1): string {
  const known = `${total.known.toFixed(digits)} ${unit}`;
  // An unknown item is shown in words, never folded into the number
  if (total.unknownItems === 0) {
    return known;
  }
  return `${known} known + ${total.unknownItems} unknown`;
}

/**
 * Return an ISO timestamp as a short local time, e.g. "07:52".
 */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
}
