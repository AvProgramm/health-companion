import { describe, expect, it } from 'vitest';
import { foodKey, totalNutrient } from './aggregate';
import { caseAComponents, expectedNumber, fixtureFoods, goldenCase } from './goldenFixture';
import { reviseAmount, startMeal } from './revisions';
import type { ChangeAmountRequest, MealRevision } from './types';
import { UnitMismatchError } from './units';

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
function caseBRequest(overrides: Partial<ChangeAmountRequest> = {}): ChangeAmountRequest {
  return {
    mealId: 'm1',
    expectedRevision: 1,
    componentId: 'demo_milk',
    amount: { amount: 250, unit: 'mL' },
    operationKey: 'edit1',
    savedAt: '2026-11-09T07:52:00+08:00',
    ...overrides,
  };
}

// Return the revision a successful change produced, or fail the test
function expectRevised(latest: MealRevision, request: ChangeAmountRequest): MealRevision {
  const result = reviseAmount(latest, request);
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
      unknownItems: expectedNumber('A', 'added_sugar_unknown_items'),
    });
  });

  it('rejects a component with a non-finite serving', () => {
    const [milk] = caseAComponents();
    const broken = [{ ...milk!, served: { amount: NaN, unit: 'mL' as const } }];
    expect(() => startMeal({ ...revisionOne(), components: broken })).toThrow(RangeError);
  });
});

describe('reviseAmount', () => {
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
    const result = reviseAmount(second, late);
    expect(result.status).toBe(goldenCase('D').expect.status);
    expect(result.status === 'conflict' ? result.latest.revision : null).toBe(expectedNumber('D', 'revision'));
  });

  it('accepts a compatible unit for the new amount', () => {
    const next = expectRevised(revisionOne(), caseBRequest({ amount: { amount: 0.25, unit: 'L' } }));
    expect(totalNutrient(next, foods, 'kcal').known).toBeCloseTo(expectedNumber('B', 'kcal'), 9);
  });

  it('refuses a unit from a different dimension', () => {
    expect(() => reviseAmount(revisionOne(), caseBRequest({ amount: { amount: 250, unit: 'g' } }))).toThrow(UnitMismatchError);
  });

  it('refuses a non-finite or negative amount', () => {
    expect(() => reviseAmount(revisionOne(), caseBRequest({ amount: { amount: NaN, unit: 'mL' } }))).toThrow(RangeError);
    expect(() => reviseAmount(revisionOne(), caseBRequest({ amount: { amount: -10, unit: 'mL' } }))).toThrow(RangeError);
  });

  it('refuses a component that is not in the meal', () => {
    expect(() => reviseAmount(revisionOne(), caseBRequest({ componentId: 'demo_coffee' }))).toThrow(/no active component/);
  });

  it('refuses a request for a different meal', () => {
    expect(() => reviseAmount(revisionOne(), caseBRequest({ mealId: 'm2' }))).toThrow(/meal m2/);
  });
});
