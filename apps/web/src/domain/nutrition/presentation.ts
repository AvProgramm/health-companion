import type { NutrientKey } from './types';

// Promote these opt-in display priorities without changing arithmetic or hiding other nutrients.
const DIABETES_FIRST: readonly NutrientKey[] = ['carbs_g', 'added_sugar_g', 'fibre_g'];

/** Return all shown nutrients with the person's opt-in priorities first. */
export function nutrientOrder(keys: readonly NutrientKey[], diabetes: boolean): readonly NutrientKey[] {
  return diabetes ? [...DIABETES_FIRST.filter(key => keys.includes(key)), ...keys.filter(key => !DIABETES_FIRST.includes(key))] : keys;
}
