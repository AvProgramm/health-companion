import { describe, expect, it } from 'vitest';
import type { MealComponent, MealRevision } from '../domain/meals/types';
import { foodKey } from '../domain/nutrition/aggregate';
import type { FoodVersion } from '../domain/nutrition/types';
import type { Unit } from '../domain/shared/units';
import { repeatRows } from './DraftCard';

/** Return a fictional food at this version. */
function food(id: string, version: number, unit: Unit = 'g'): FoodVersion {
  return { id, version, name: `Fictional ${id}`, basis: { amount: 100, unit }, nutrients: { kcal: 100 }, source: { kind: 'label' } };
}

/** Return one fictional saved item. */
function item(changes: Partial<MealComponent> = {}): MealComponent {
  return { id: 'item', foodId: 'oats', foodVersion: 1, served: { amount: 40, unit: 'g' }, eatenFraction: 1, active: true, ...changes };
}

/** Return a fictional saved meal holding these items. */
function meal(...components: MealComponent[]): MealRevision {
  return { mealId: 'meal', revision: 1, supersedes: null, operationKey: 'key', localDate: '2026-11-08', zone: 'UTC', savedAt: '2026-11-08T01:00:00Z', components };
}

describe('logging a meal again', () => {
  it('repeats the amount and the share eaten last time', () => {
    expect(repeatRows(meal(item({ eatenFraction: 0.5 })), [food('oats', 1)])).toMatchObject([{ text: '', foodKey: foodKey('oats', 1), amountText: '40', unit: 'g', eatenFraction: 0.5, problem: null }]);
  });

  it('uses the newest version of the food, the same as typing its name today', () => {
    expect(repeatRows(meal(item({ foodVersion: 1 })), [food('oats', 3)])[0]!.foodKey).toBe(foodKey('oats', 3));
  });

  it('leaves out a removed item and one where nothing was eaten', () => {
    expect(repeatRows(meal(item({ active: false }), item({ eatenFraction: 0 })), [food('oats', 1)])).toEqual([]);
  });

  it('starts at all of it when the draft cannot show the share eaten', () => {
    expect(repeatRows(meal(item({ eatenFraction: 0.33 })), [food('oats', 1)])[0]!.eatenFraction).toBe(1);
  });

  it('asks for the amount again when the food is now measured another way', () => {
    expect(repeatRows(meal(item()), [food('oats', 2, 'piece')])).toMatchObject([{ amountText: '', unit: 'piece', problem: null }]);
  });
});
