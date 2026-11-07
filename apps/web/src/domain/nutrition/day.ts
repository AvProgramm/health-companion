import { totalNutrient, type NutrientTotal } from './aggregate';
import type { FoodVersion, NutrientKey } from './types';
import type { MealRevision } from '../meals/types';

// The nutrients the day summary reports, in display order
export const SUMMARY_NUTRIENTS: readonly NutrientKey[] = ['kcal', 'protein_g', 'fat_g', 'satfat_g', 'total_sugar_g', 'added_sugar_g'];

/**
 * The totals for one diary date.
 *
 * coverage is "no_entries" when nothing was logged, which the screen must show
 * as "nothing logged", never as zero intake.
 */
export interface DaySummary {
  date: string;
  mealCount: number;
  coverage: 'no_entries' | 'some_entries';
  totals: Record<NutrientKey, NutrientTotal>;
}

/**
 * Return the totals for one date from the latest revision of each meal.
 *
 * Deleted meals and meals saved under another date are left out, so a meal
 * counts once, on the date it was eaten.
 */
export function summariseDay(
  date: string,
  latestRevisions: readonly MealRevision[],
  foods: ReadonlyMap<string, FoodVersion>,
): DaySummary {
  // Keep only live meals on this date
  const meals = latestRevisions.filter((revision) => revision.localDate === date && revision.deleted !== true);

  // Add up each nutrient across those meals, keeping unknown items separate
  const totals = {} as Record<NutrientKey, NutrientTotal>;
  for (const nutrient of SUMMARY_NUTRIENTS) {
    const total: NutrientTotal = { known: 0, unknownItems: 0 };
    for (const meal of meals) {
      const mealTotal = totalNutrient(meal, foods, nutrient);
      total.known += mealTotal.known;
      total.unknownItems += mealTotal.unknownItems;
    }
    totals[nutrient] = total;
  }

  // Return the summary, marking an empty date as "no entries"
  return {
    date,
    mealCount: meals.length,
    coverage: meals.length === 0 ? 'no_entries' : 'some_entries',
    totals,
  };
}
