import type { NutrientTotal } from '../domain/nutrition/aggregate';
import type { NutrientKey, NutrientValue, SourceKind } from '../domain/nutrition/types';
import type { Quantity } from '../domain/shared/units';
import type { Capability, Equipment } from '../domain/training/catalogue';
import type { ExerciseLevel } from '../domain/training/exerciseSearch';

/** Return an energy-burnt estimate as words, always as a range, rounded for display only. */
export function burnText(burn: { low: number; high: number }): string {
  return `About ${Math.round(burn.low)}–${Math.round(burn.high)} kcal burnt (estimate)`;
}

// How each ability an exercise needs reads in a list of facts
export const CAPABILITY_LABELS: Record<Capability, string> = { pull_up: 'A pull-up', jumping: 'Jumping' };

// How the source's difficulty levels read on screen
export const LEVEL_LABELS: Record<ExerciseLevel, string> = { beginner: 'Beginner', intermediate: 'Intermediate', expert: 'Expert' };

// How each piece of equipment is named on a chip or in a list
export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  dumbbells: 'Dumbbells', band: 'Resistance band', pull_up_bar: 'Pull-up bar', kettlebells: 'Kettlebells', barbell: 'Barbell',
  ez_curl_bar: 'EZ curl bar', cable: 'Cable station', machine: 'Gym machine', medicine_ball: 'Medicine ball',
  exercise_ball: 'Exercise ball', foam_roll: 'Foam roller',
};

// How each nutrient is named and measured on screen
export const NUTRIENT_LABELS: Record<NutrientKey, { label: string; unit: string }> = {
  kcal: { label: 'Energy', unit: 'kcal' },
  protein_g: { label: 'Protein', unit: 'g' },
  carbs_g: { label: 'Carbohydrate', unit: 'g' },
  fibre_g: { label: 'Fibre', unit: 'g' },
  total_sugar_g: { label: 'Total sugar', unit: 'g' },
  added_sugar_g: { label: 'Added sugar', unit: 'g' },
  fat_g: { label: 'Fat', unit: 'g' },
  satfat_g: { label: 'Saturated fat', unit: 'g' },
  unsatfat_g: { label: 'Unsaturated fat', unit: 'g' },
  sodium_mg: { label: 'Sodium', unit: 'mg' },
};

// The badge text for where a food's numbers came from
export const SOURCE_LABELS: Record<SourceKind, string> = {
  label: 'From label',
  user_estimate: 'My estimate',
  fixture: 'Sample',
  database: 'Database estimate',
  ai_estimate: 'AI estimate',
  web_estimate: 'Web supplemented',
};

/**
 * Return the "Sources and assumptions" text for a food, or null when there is none.
 *
 * A sample's reference is a repository file path, which means nothing to a person,
 * so it reads as what it is instead.
 */
export function describeSource(source: { kind: SourceKind; reference?: string }): string | null {
  // Ignore the file path of a sample because only the tests need it
  if (source.kind === 'fixture') {
    return 'A fictional sample label from the app\'s test data, not a real product.';
  }
  return source.reference ?? null;
}

/**
 * Return a nutrient total as display text, e.g. "110.8 kcal" or "0.0 g known + 1 unknown".
 *
 * Rounding happens only here, so stored values keep full precision.
 */
export function formatTotal(total: NutrientTotal, unit: string, digits = 1): string {
  // No item had a value, so there is no total to show, not a total of zero
  if (total.knownItems === 0 && total.unknownItems > 0) {
    return `unknown (${total.unknownItems} ${total.unknownItems === 1 ? 'item' : 'items'} without a value)`;
  }
  const bounds = total.range === undefined ? '' : ` (${total.range.low.toFixed(digits)}–${total.range.high.toFixed(digits)})`;
  const known = `${total.range === undefined ? '' : '≈ '}${total.known.toFixed(digits)} ${unit}${bounds}`;
  // An unknown item is shown in words, never folded into the number
  if (total.unknownItems === 0) {
    return known;
  }
  return `${known} known + ${total.unknownItems} unknown`;
}

/**
 * Return one nutrient value as text, with "unknown" for a blank label value.
 */
export function formatValue(value: NutrientValue, unit: string, digits = 1): string {
  return value === null ? `${unit} unknown` : `${value.toFixed(digits)} ${unit}`;
}

/**
 * Return a quantity as text, e.g. "300 mL" or "2 pieces".
 */
export function formatQuantity(quantity: Quantity): string {
  // Drop trailing zeros so 0.25 L reads as "0.25 L", not "0.250 L"
  const amount = Number(quantity.amount.toFixed(2)).toString();
  if (quantity.unit === 'piece') {
    return `${amount} ${quantity.amount === 1 ? 'piece' : 'pieces'}`;
  }
  return `${amount} ${quantity.unit}`;
}

/**
 * Return an eaten fraction as words, e.g. "half eaten"; empty when all was eaten.
 */
export function formatEaten(fraction: number): string {
  if (fraction === 1) {
    return '';
  }
  if (fraction === 0) {
    return 'none eaten';
  }
  return `${Math.round(fraction * 100)}% eaten`;
}

/**
 * Return an ISO timestamp as a short local time, e.g. "07:52".
 */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * Return a diary date (YYYY-MM-DD) as "Sat 7 Nov".
 */
export function formatDiaryDate(date: string): string {
  // Read the date at noon UTC and format it in UTC, so the device zone cannot shift the day
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/**
 * Return a meal name from the local time it was first saved.
 */
export function mealTitle(createdAt: string): string {
  const hour = new Date(createdAt).getHours();
  if (hour < 11) {
    return 'Breakfast';
  }
  if (hour < 15) {
    return 'Lunch';
  }
  if (hour < 18) {
    return 'Afternoon snack';
  }
  return 'Dinner';
}

/**
 * Return a typed amount as a number, or null if it is not a usable amount.
 *
 * Accepts a comma as the decimal mark, since some phone keyboards only offer one.
 */
export function readAmount(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') {
    return null;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : null;
}


// Keep very large display-only labels inside the minutes ring; exact totals remain elsewhere.
const COMPACT_MINUTES = new Intl.NumberFormat('en-AU', { notation: 'compact', maximumFractionDigits: 1 });

/** Return a short ring label without changing the stored or planned minute total. */
export function formatRingMinutes(minutes: number): string {
  return minutes < 10_000 ? String(minutes) : COMPACT_MINUTES.format(minutes);
}
