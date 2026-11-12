import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { startMeal } from '../../domain/meals/revisions';
import type { MealEditRequest, MealRevision } from '../../domain/meals/types';
import type { Quantity } from '../../domain/shared/units';
import { MILK, TEST_FOOD_MAP } from '../../test/testFoods';
import { DIARY_NAME, openDiary } from './connection';
import { saveFoodVersion } from './foodsRepo';
import { commitEdit, confirmMeal, countMeals, listRevisions, mealsOn } from './mealsRepo';

// A fresh in-memory database for every test, so tests cannot leak into each other
let db: IDBDatabase;
beforeEach(async () => {
  db = await openDiary(DIARY_NAME, new IDBFactory());
  await saveFoodVersion(db, MILK);
});

// Revision 1 of a one-food meal: 300 mL of the golden milk
function milkMeal(operationKey = 'save1'): MealRevision {
  return startMeal({
    mealId: 'm1',
    localDate: '2026-11-09',
    zone: 'Asia/Kuala_Lumpur',
    savedAt: '2026-11-09T07:40:00+08:00',
    operationKey,
    components: [{ id: 'c1', foodId: MILK.id, foodVersion: 1, served: { amount: 300, unit: 'mL' }, eatenFraction: 1, active: true }],
  });
}

// The milk correction 300 → 250 mL, based on revision 1
function correction(overrides: { expectedRevision?: number; amount?: Quantity; operationKey?: string } = {}): MealEditRequest {
  return {
    mealId: 'm1',
    expectedRevision: overrides.expectedRevision ?? 1,
    operationKey: overrides.operationKey ?? 'edit1',
    savedAt: '2026-11-09T07:52:00+08:00',
    edit: { kind: 'update_component', componentId: 'c1', served: overrides.amount ?? { amount: 250, unit: 'mL' }, eatenFraction: 1 },
  };
}

// The latest revision number stored for meal m1
async function latestRevision(database: IDBDatabase): Promise<number | undefined> {
  return (await mealsOn(database, '2026-11-09'))[0]?.header.latestRevision;
}

describe('confirmMeal', () => {
  it('saves one meal even when the same save is sent twice', async () => {
    const first = await confirmMeal(db, milkMeal(), TEST_FOOD_MAP);
    const again = await confirmMeal(db, milkMeal(), TEST_FOOD_MAP);
    expect(first).toMatchObject({ status: 'saved', replayed: false });
    expect(again).toMatchObject({ status: 'saved', replayed: true });
    expect(await countMeals(db)).toBe(1);
    expect(await listRevisions(db, 'm1')).toHaveLength(1);
  });
});

describe('commitEdit', () => {
  it('adds revision 2 and moves the header pointer', async () => {
    await confirmMeal(db, milkMeal(), TEST_FOOD_MAP);
    expect((await commitEdit(db, correction(), TEST_FOOD_MAP)).status).toBe('saved');
    expect(await latestRevision(db)).toBe(2);
    const history = await listRevisions(db, 'm1');
    expect(history.map((revision) => revision.components[0]?.served.amount)).toEqual([300, 250]);
  });

  it('returns the same revision when a correction is retried (golden C)', async () => {
    await confirmMeal(db, milkMeal(), TEST_FOOD_MAP);
    await commitEdit(db, correction(), TEST_FOOD_MAP);
    const retry = await commitEdit(db, correction(), TEST_FOOD_MAP);
    expect(retry).toMatchObject({ status: 'saved', replayed: true });
    expect(retry.status === 'saved' && retry.revision.revision).toBe(2);
    expect(await listRevisions(db, 'm1')).toHaveLength(2);
    expect(await countMeals(db)).toBe(1);
  });

  it('writes nothing for a stale correction (golden D)', async () => {
    await confirmMeal(db, milkMeal(), TEST_FOOD_MAP);
    await commitEdit(db, correction(), TEST_FOOD_MAP);
    const late = await commitEdit(db, correction({ operationKey: 'late1', amount: { amount: 150, unit: 'mL' } }), TEST_FOOD_MAP);
    expect(late.status).toBe('conflict');
    expect(late.status === 'conflict' && late.latest.revision).toBe(2);
    expect(await listRevisions(db, 'm1')).toHaveLength(2);
  });

  it('lets a conflicting key be used again once the screen has refreshed', async () => {
    await confirmMeal(db, milkMeal(), TEST_FOOD_MAP);
    await commitEdit(db, correction(), TEST_FOOD_MAP);
    await commitEdit(db, correction({ operationKey: 'late1', amount: { amount: 150, unit: 'mL' } }), TEST_FOOD_MAP);
    // A conflict does not burn the key, so the user's next attempt from revision 2 can save
    const retried = await commitEdit(db, correction({ operationKey: 'late1', expectedRevision: 2, amount: { amount: 150, unit: 'mL' } }), TEST_FOOD_MAP);
    expect(retried.status === 'saved' && retried.revision.revision).toBe(3);
  });

  it('rolls back the whole transaction when the domain refuses the change', async () => {
    await confirmMeal(db, milkMeal(), TEST_FOOD_MAP);
    await expect(commitEdit(db, correction({ amount: { amount: NaN, unit: 'mL' } }), TEST_FOOD_MAP)).rejects.toThrow(RangeError);
    expect(await latestRevision(db)).toBe(1);
    expect(await listRevisions(db, 'm1')).toHaveLength(1);
  });

  it('refuses a correction for a meal that was never saved', async () => {
    await expect(commitEdit(db, correction(), TEST_FOOD_MAP)).rejects.toThrow(/not saved/);
  });

  it('refuses a replacement whose unit does not fit the food label', async () => {
    await confirmMeal(db, milkMeal(), TEST_FOOD_MAP);
    // 300 g against a millilitre label cannot be totalled, so nothing is saved
    const replacement = { id: 'c2', foodId: MILK.id, foodVersion: 1, served: { amount: 300, unit: 'g' as const }, eatenFraction: 1, active: true };
    await expect(
      commitEdit(db, { mealId: 'm1', expectedRevision: 1, operationKey: 'bad', savedAt: 'now', edit: { kind: 'replace_food', componentId: 'c1', replacement } }, TEST_FOOD_MAP),
    ).rejects.toThrow(/Cannot convert/);
    expect(await listRevisions(db, 'm1')).toHaveLength(1);
  });

  it('keeps everything after the database is closed and reopened', async () => {
    const factory = new IDBFactory();
    const first = await openDiary(DIARY_NAME, factory);
    await saveFoodVersion(first, MILK);
    await confirmMeal(first, milkMeal(), TEST_FOOD_MAP);
    await commitEdit(first, correction(), TEST_FOOD_MAP);
    first.close();

    const reopened = await openDiary(DIARY_NAME, factory);
    expect(await latestRevision(reopened)).toBe(2);
    expect(await listRevisions(reopened, 'm1')).toHaveLength(2);
  });
});

describe('mealsOn', () => {
  it('returns only the meals of the requested date, with their latest revision', async () => {
    await confirmMeal(db, milkMeal(), TEST_FOOD_MAP);
    await commitEdit(db, correction(), TEST_FOOD_MAP);
    expect((await mealsOn(db, '2026-11-09')).map((meal) => meal.latest.revision)).toEqual([2]);
    expect(await mealsOn(db, '2026-11-10')).toEqual([]);
  });
});
