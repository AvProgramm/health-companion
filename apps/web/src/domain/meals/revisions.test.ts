import { describe, expect, it } from 'vitest';
import { foodKey, totalNutrient } from '../nutrition/aggregate';
import { caseAComponents, expectedNumber, fixtureFoods, goldenCase } from '../../test/goldenFixture';
import { reviseMeal, startMeal } from './revisions';
import type { MealEdit, MealEditRequest, MealRevision } from './types';
import { UnitMismatchError, type Quantity } from '../shared/units';

// Foods keyed the way totalNutrient looks them up
const foods = new Map([...fixtureFoods().values()].map((food) => [foodKey(food.id, food.version), food]));

// Build revision 1 of golden meal m1: 300 mL milk and two biscuits
function revisionOne(): MealRevision {
  return startMeal({
    mealId: 'm1',
    localDate: '2026-11-09',
    zone: 'Asia/Kuala_Lumpur',
    savedAt: '2026-11-09T07:40:00+08:00',
    operationKey: 'save1',
    components: caseAComponents(),
  });
}

// Build the golden case B request: milk 300 → 250 mL, based on revision 1
function caseBRequest(overrides: { mealId?: string; expectedRevision?: number; componentId?: string; amount?: Quantity; operationKey?: string } = {}): MealEditRequest {
  return {
    mealId: overrides.mealId ?? 'm1',
    expectedRevision: overrides.expectedRevision ?? 1,
    operationKey: overrides.operationKey ?? 'edit1',
    savedAt: '2026-11-09T07:52:00+08:00',
    edit: { kind: 'update_component', componentId: overrides.componentId ?? 'demo_milk', served: overrides.amount ?? { amount: 250, unit: 'mL' }, eatenFraction: 1 },
  };
}

// Return the revision a successful change produced, or fail the test
function expectRevised(latest: MealRevision, request: MealEditRequest): MealRevision {
  const result = reviseMeal(latest, request);
  if (result.status !== 'revised') {
    throw new Error(`Expected a revision, got ${result.status}`);
  }
  return result.next;
}

describe('startMeal (golden A)', () => {
  it('starts at revision 1 with the expected totals', () => {
    const first = revisionOne();
    expect(first.revision).toBe(expectedNumber('A', 'revision'));
    expect(first.supersedes).toBeNull();
    expect(totalNutrient(first, foods, 'kcal').known).toBeCloseTo(expectedNumber('A', 'kcal'), 9);
    expect(totalNutrient(first, foods, 'protein_g').known).toBeCloseTo(expectedNumber('A', 'protein_g'), 9);
    expect(totalNutrient(first, foods, 'added_sugar_g')).toEqual({
      known: expectedNumber('A', 'added_sugar_known_g'),
      knownItems: 1,
      unknownItems: expectedNumber('A', 'added_sugar_unknown_items'),
    });
  });

  it('rejects a component with a non-finite serving', () => {
    const [milk] = caseAComponents();
    const broken = [{ ...milk!, served: { amount: NaN, unit: 'mL' as const } }];
    expect(() => startMeal({ ...revisionOne(), components: broken })).toThrow(RangeError);
  });
});

describe('reviseMeal: the golden correction', () => {
  it('produces revision 2 with the golden B totals', () => {
    const next = expectRevised(revisionOne(), caseBRequest());
    expect(next.revision).toBe(expectedNumber('B', 'revision'));
    expect(next.supersedes).toBe(1);
    expect(next.operationKey).toBe('edit1');
    expect(totalNutrient(next, foods, 'kcal').known).toBeCloseTo(expectedNumber('B', 'kcal'), 9);
    expect(totalNutrient(next, foods, 'protein_g').known).toBeCloseTo(expectedNumber('B', 'protein_g'), 9);
    // Lactose stays out of added sugar, and the biscuit's blank value stays unknown
    expect(totalNutrient(next, foods, 'added_sugar_g')).toEqual({
      known: expectedNumber('B', 'added_sugar_known_g'),
      knownItems: 1,
      unknownItems: expectedNumber('B', 'added_sugar_unknown_items'),
    });
  });

  it('leaves the other component exactly as it was', () => {
    const first = revisionOne();
    const next = expectRevised(first, caseBRequest());
    const biscuitBefore = first.components.find((component) => component.id === 'demo_biscuit');
    const biscuitAfter = next.components.find((component) => component.id === 'demo_biscuit');
    expect(biscuitAfter).toBe(biscuitBefore);
    expect(next.components).toHaveLength(first.components.length);
  });

  it('never edits the latest revision in place', () => {
    const first = revisionOne();
    const before = structuredClone(first);
    expectRevised(first, caseBRequest());
    expect(first).toEqual(before);
  });

  it('returns a conflict for a change based on an older revision (golden D)', () => {
    const second = expectRevised(revisionOne(), caseBRequest());
    const late = caseBRequest({ expectedRevision: 1, amount: { amount: 150, unit: 'mL' }, operationKey: 'late1' });
    const result = reviseMeal(second, late);
    expect(result.status).toBe(goldenCase('D').expect.status);
    expect(result.status === 'conflict' ? result.latest.revision : null).toBe(expectedNumber('D', 'revision'));
  });

  it('accepts a compatible unit for the new amount', () => {
    const next = expectRevised(revisionOne(), caseBRequest({ amount: { amount: 0.25, unit: 'L' } }));
    expect(totalNutrient(next, foods, 'kcal').known).toBeCloseTo(expectedNumber('B', 'kcal'), 9);
  });

  it('refuses a unit from a different dimension', () => {
    expect(() => reviseMeal(revisionOne(), caseBRequest({ amount: { amount: 250, unit: 'g' } }))).toThrow(UnitMismatchError);
  });

  it('refuses a non-finite or negative amount', () => {
    expect(() => reviseMeal(revisionOne(), caseBRequest({ amount: { amount: NaN, unit: 'mL' } }))).toThrow(RangeError);
    expect(() => reviseMeal(revisionOne(), caseBRequest({ amount: { amount: -10, unit: 'mL' } }))).toThrow(RangeError);
  });

  it('refuses a component that is not in the meal', () => {
    expect(() => reviseMeal(revisionOne(), caseBRequest({ componentId: 'demo_coffee' }))).toThrow(/no active component/);
  });

  it('refuses a request for a different meal', () => {
    expect(() => reviseMeal(revisionOne(), caseBRequest({ mealId: 'm2' }))).toThrow(/meal m2/);
  });
});

describe('reviseMeal', () => {
  // Apply one edit to revision 1 and return revision 2, or fail the test
  function edit(meal: MealRevision, mealEdit: MealEdit): MealRevision {
    const result = reviseMeal(meal, { mealId: 'm1', expectedRevision: meal.revision, operationKey: `op-${meal.revision}`, savedAt: '2026-11-09T08:00:00+08:00', edit: mealEdit });
    if (result.status !== 'revised') {
      throw new Error('Expected a revision');
    }
    return result.next;
  }

  it('leaves half the biscuits uneaten without changing the served amount', () => {
    const next = edit(revisionOne(), { kind: 'update_component', componentId: 'demo_biscuit', served: { amount: 2, unit: 'piece' }, eatenFraction: 0.5 });
    // 300 mL milk (132.96) + half of 133 kcal of biscuit (66.5)
    expect(totalNutrient(next, foods, 'kcal').known).toBeCloseTo(132.96 + 66.5, 9);
  });

  it('refuses an eaten fraction outside [0, 1]', () => {
    expect(() => edit(revisionOne(), { kind: 'update_component', componentId: 'demo_biscuit', served: { amount: 2, unit: 'piece' }, eatenFraction: 1.5 })).toThrow(RangeError);
  });

  it('replaces a food, keeping the old item in the snapshot but out of the totals', () => {
    const replacement = { id: 'c3', foodId: 'demo_milk', foodVersion: 1, served: { amount: 100, unit: 'mL' as const }, eatenFraction: 1, active: true };
    const next = edit(revisionOne(), { kind: 'replace_food', componentId: 'demo_biscuit', replacement });
    expect(next.components.map((component) => [component.id, component.active])).toEqual([
      ['demo_milk', true],
      ['demo_biscuit', false],
      ['c3', true],
    ]);
    // 300 mL + 100 mL of milk, and no biscuit
    expect(totalNutrient(next, foods, 'kcal').known).toBeCloseTo(110.8 * 400 / 250, 9);
    expect(totalNutrient(next, foods, 'added_sugar_g')).toEqual({ known: 0, knownItems: 2, unknownItems: 0 });
  });

  it('removes an item so it no longer counts', () => {
    const next = edit(revisionOne(), { kind: 'remove_component', componentId: 'demo_milk' });
    expect(totalNutrient(next, foods, 'kcal').known).toBeCloseTo(133, 9);
    expect(() => edit(next, { kind: 'remove_component', componentId: 'demo_milk' })).toThrow(/no active component/);
  });

  it('deletes a meal and refuses further edits until it is restored', () => {
    const first = revisionOne();
    const deleted = edit(first, { kind: 'delete_meal' });
    expect(deleted.deleted).toBe(true);
    expect(() => edit(deleted, { kind: 'remove_component', componentId: 'demo_milk' })).toThrow(/deleted/);

    // Undo = a new revision with revision 1's contents, not a rewind
    const restored = edit(deleted, { kind: 'restore', fromRevision: 1, components: first.components, deleted: false });
    expect(restored.revision).toBe(3);
    expect(restored.deleted).toBe(false);
    expect(restored.components).toEqual(first.components);
  });

  it('only restores an earlier revision', () => {
    const first = revisionOne();
    expect(() => edit(first, { kind: 'restore', fromRevision: 1, components: first.components, deleted: false })).toThrow(/Cannot restore/);
  });
});
