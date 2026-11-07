import { describe, expect, it } from 'vitest';
import { foodKey } from './aggregate';
import { summariseDay } from './day';
import { caseAComponents, expectedNumber, fixtureFoods, goldenCase } from '../../test/goldenFixture';
import { reviseMeal, startMeal } from '../meals/revisions';
import type { MealRevision } from '../meals/types';

const foods = new Map([...fixtureFoods().values()].map((food) => [foodKey(food.id, food.version), food]));

// Golden meal m1 on 9 Nov, at revision 1 (300 mL milk) or 2 (250 mL)
function goldenMeal(revision: 1 | 2): MealRevision {
  const first = startMeal({
    mealId: 'm1',
    localDate: '2026-11-09',
    zone: 'Asia/Kuala_Lumpur',
    savedAt: '2026-11-09T07:40:00+08:00',
    operationKey: 'save1',
    components: caseAComponents(),
  });
  if (revision === 1) {
    return first;
  }
  const result = reviseMeal(first, {
    mealId: 'm1',
    expectedRevision: 1,
    operationKey: 'edit1',
    savedAt: '2026-11-09T07:52:00+08:00',
    edit: { kind: 'update_component', componentId: 'demo_milk', served: { amount: 250, unit: 'mL' }, eatenFraction: 1 },
  });
  if (result.status !== 'revised') {
    throw new Error('Golden B should revise');
  }
  return result.next;
}

describe('summariseDay', () => {
  it('totals the latest revision only (golden B)', () => {
    const day = summariseDay('2026-11-09', [goldenMeal(2)], foods);
    expect(day.mealCount).toBe(1);
    expect(day.totals.kcal.known).toBeCloseTo(expectedNumber('B', 'kcal'), 9);
    expect(day.totals.protein_g.known).toBeCloseTo(expectedNumber('B', 'protein_g'), 9);
    expect(day.totals.added_sugar_g).toEqual({ known: 0, knownItems: 1, unknownItems: 1 });
  });

  it('reports no entries instead of zero intake for an empty day (golden E)', () => {
    const day = summariseDay(String(goldenCase('E').expect.date ?? '2026-11-10'), [goldenMeal(2)], foods);
    expect(day.mealCount).toBe(expectedNumber('E', 'meal_count'));
    expect(day.coverage).toBe(goldenCase('E').expect.coverage);
  });

  it('leaves a deleted meal out of the totals', () => {
    const deleted: MealRevision = { ...goldenMeal(2), deleted: true };
    const day = summariseDay('2026-11-09', [deleted], foods);
    expect(day.mealCount).toBe(0);
    expect(day.coverage).toBe('no_entries');
  });
});
