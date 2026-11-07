import { scaleNutrient } from './scale';
import type { FoodVersion, NutrientKey } from './types';
import type { MealRevision } from '../meals/types';

/**
 * A nutrient total that keeps what is known apart from what is missing.
 *
 * "0 g known + 1 unknown" is more honest than "0 g", because one item's label
 * did not give a value for this nutrient.
 */
export interface NutrientTotal {
  known: number;
  unknownItems: number;
  range?: { low: number; high: number };
}

/**
 * Return the total of one nutrient across the active components of a meal revision.
 *
 * Each component is looked up by food ID and version, scaled with scaleNutrient,
 * and either added to the known subtotal or counted as an unknown item.
 */
export function totalNutrient(
  revision: Pick<MealRevision, 'components'>,
  foods: ReadonlyMap<string, FoodVersion>,
  nutrient: NutrientKey,
): NutrientTotal {
  // Initialise the running total
  let known = 0;
  let unknownItems = 0;
  let low = 0;
  let high = 0;
  let estimated = false;

  for (const component of revision.components) {
    // Ignore a component that a correction has removed from the meal
    if (!component.active) {
      continue;
    }

    // Find the exact food version the component was saved with
    const food = foods.get(foodKey(component.foodId, component.foodVersion));
    if (food === undefined) {
      throw new Error(`Food ${component.foodId} v${component.foodVersion} is missing`);
    }

    // A missing label value is treated the same as a blank one
    const scaled = scaleNutrient(food.nutrients[nutrient] ?? null, food.basis, component.served, component.eatenFraction);

    // Add a known value, or count the item as unknown
    if (scaled === null) {
      unknownItems += 1;
    } else {
      known += scaled;
      // Scale each bound with the same serving and eaten fraction as the centre.
      const spread = food.range?.[nutrient];
      low += spread == null ? scaled : scaleNutrient(spread.low, food.basis, component.served, component.eatenFraction)!;
      high += spread == null ? scaled : scaleNutrient(spread.high, food.basis, component.served, component.eatenFraction)!;
      estimated ||= spread != null || food.source.kind === 'ai_estimate' || food.source.kind === 'database';
    }
  }

  // Return the known subtotal and the number of unknown items
  return { known, unknownItems, ...(estimated ? { range: { low, high } } : {}) };
}

/**
 * Return the key used to look up one version of a food.
 */
export function foodKey(foodId: string, version: number): string {
  return `${foodId}@${version}`;
}
