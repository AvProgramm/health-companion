/**
 * Fictional foods shared by the parser, correction and day tests.
 *
 * Numbers match eval/fixtures/ledger_golden.json; the names are what a user
 * would actually type.
 */
import { DEMO_BISCUIT, DEMO_MILK } from '../data/demoFoods';
import { foodKey } from './aggregate';
import type { FoodVersion } from './types';

export const MILK: FoodVersion = { ...DEMO_MILK, name: 'Milk', aliases: ['full cream milk'] };
export const WEETABIX: FoodVersion = { ...DEMO_BISCUIT, id: 'weetabix', name: 'Weetabix', aliases: ['wheat biscuit'] };
export const COFFEE: FoodVersion = {
  id: 'coffee',
  version: 1,
  name: 'Black coffee',
  aliases: ['coffee'],
  basis: { amount: 250, unit: 'mL' },
  nutrients: { kcal: 2, protein_g: 0.3, added_sugar_g: 0 },
  source: { kind: 'user_estimate' },
};
export const RICE: FoodVersion = {
  id: 'rice',
  version: 1,
  name: 'Cooked white rice',
  aliases: ['rice'],
  basis: { amount: 100, unit: 'g' },
  nutrients: { kcal: 130, protein_g: 2.7, added_sugar_g: 0 },
  source: { kind: 'label' },
};

export const TEST_FOODS: readonly FoodVersion[] = [MILK, WEETABIX, COFFEE, RICE];

// Foods keyed the way totalNutrient looks them up
export const TEST_FOOD_MAP: ReadonlyMap<string, FoodVersion> = new Map(
  TEST_FOODS.map((food) => [foodKey(food.id, food.version), food]),
);
