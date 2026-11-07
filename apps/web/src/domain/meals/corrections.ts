import { foodKey } from '../nutrition/aggregate';
import { findFoods } from '../nutrition/foods';
import type { ParsedAmount } from '../parsing/types';
import type { FoodVersion } from '../nutrition/types';
import type { MealComponent, MealRevision } from './types';
import { areCompatible, type Quantity } from '../shared/units';

/**
 * One saved item a correction could apply to.
 */
export interface CorrectionTarget {
  meal: MealRevision;
  component: MealComponent;
  food: FoodVersion;
}

/**
 * Return every item on the day that a correction like "actually 250 mL" could mean.
 *
 * An item qualifies if the new amount can describe it (mL for a millilitre item,
 * a bare count for a counted item) and, when a food was named, if it is that food.
 * The screen saves straight away only when exactly one item qualifies; with two or
 * more it asks which one, so a correction is never applied to a guess.
 */
export function findCorrectionTargets(
  meals: readonly MealRevision[],
  foods: ReadonlyMap<string, FoodVersion>,
  amount: ParsedAmount,
  foodHint: string | null,
): CorrectionTarget[] {
  const targets: CorrectionTarget[] = [];

  for (const meal of meals) {
    // Ignore a deleted meal, which can only be restored, not corrected
    if (meal.deleted === true) {
      continue;
    }

    for (const component of meal.components) {
      // Ignore an item a previous correction removed
      if (!component.active) {
        continue;
      }

      const food = foods.get(foodKey(component.foodId, component.foodVersion));
      if (food === undefined) {
        continue;
      }

      // Keep only items the new amount can describe
      const fits = amount.unit === null ? component.served.unit === 'piece' : areCompatible(component.served.unit, amount.unit);
      if (!fits) {
        continue;
      }

      // When a food was named, keep only that food
      if (foodHint !== null && findFoods(foodHint, [food]).length === 0) {
        continue;
      }

      targets.push({ meal, component, food });
    }
  }

  // Return the qualifying items
  return targets;
}

/**
 * Return the corrected quantity; a bare count means pieces.
 */
export function correctedQuantity(amount: ParsedAmount): Quantity {
  return { amount: amount.amount, unit: amount.unit ?? 'piece' };
}
