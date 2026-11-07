import { describe, expect, it } from 'vitest';
import { findCorrectionTargets } from './corrections';
import { startMeal } from './revisions';
import { COFFEE, MILK, RICE, TEST_FOOD_MAP, WEETABIX } from './testFoods';
import type { FoodVersion, MealRevision } from './types';
import type { Quantity } from './units';

// Build a saved meal from (food, serving) pairs
function meal(mealId: string, items: [FoodVersion, Quantity][]): MealRevision {
  return startMeal({
    mealId,
    localDate: '2026-11-09',
    zone: 'Asia/Kuala_Lumpur',
    savedAt: '2026-11-09T07:40:00+08:00',
    operationKey: `save-${mealId}`,
    components: items.map(([food, served]) => ({
      id: food.id,
      foodId: food.id,
      foodVersion: food.version,
      served,
      eatenFraction: 1,
      active: true,
    })),
  });
}

const BREAKFAST = meal('breakfast', [
  [WEETABIX, { amount: 2, unit: 'piece' }],
  [MILK, { amount: 300, unit: 'mL' }],
]);

describe('findCorrectionTargets', () => {
  it('finds the one millilitre item for "actually 250 mL"', () => {
    const targets = findCorrectionTargets([BREAKFAST], TEST_FOOD_MAP, { amount: 250, unit: 'mL' }, null);
    expect(targets.map((target) => target.food.id)).toEqual(['demo_milk']);
  });

  it('returns both items when two millilitre drinks could be meant', () => {
    const withCoffee = meal('coffee', [[COFFEE, { amount: 200, unit: 'mL' }]]);
    const targets = findCorrectionTargets([BREAKFAST, withCoffee], TEST_FOOD_MAP, { amount: 250, unit: 'mL' }, null);
    expect(targets.map((target) => target.food.id)).toEqual(['demo_milk', 'coffee']);
  });

  it('narrows to the named food', () => {
    const withCoffee = meal('coffee', [[COFFEE, { amount: 200, unit: 'mL' }]]);
    const targets = findCorrectionTargets([BREAKFAST, withCoffee], TEST_FOOD_MAP, { amount: 250, unit: 'mL' }, 'milk');
    expect(targets.map((target) => target.food.id)).toEqual(['demo_milk']);
  });

  it('matches a bare count only to counted items', () => {
    const targets = findCorrectionTargets([BREAKFAST], TEST_FOOD_MAP, { amount: 1, unit: null }, null);
    expect(targets.map((target) => target.food.id)).toEqual(['weetabix']);
  });

  it('finds nothing when no item has a fitting unit', () => {
    expect(findCorrectionTargets([BREAKFAST], TEST_FOOD_MAP, { amount: 150, unit: 'g' }, null)).toEqual([]);
    const lunch = meal('lunch', [[RICE, { amount: 200, unit: 'g' }]]);
    expect(findCorrectionTargets([lunch], TEST_FOOD_MAP, { amount: 150, unit: 'g' }, 'milk')).toEqual([]);
  });

  it('skips deleted meals and removed items', () => {
    const deleted: MealRevision = { ...BREAKFAST, deleted: true };
    expect(findCorrectionTargets([deleted], TEST_FOOD_MAP, { amount: 250, unit: 'mL' }, null)).toEqual([]);
  });
});
