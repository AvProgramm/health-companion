import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_MILK } from '../data/demoFoods';
import { startMeal } from '../domain/revisions';
import type { ChangeAmountRequest, MealRevision } from '../domain/types';
import { commitEdit, commitRevision, confirmMeal, countMeals, ensureFood, latestMeal, listRevisions, mealsOn, openDiary } from './db';

// A fresh in-memory database for every test, so tests cannot leak into each other
let db: IDBDatabase;
beforeEach(async () => {
  db = await openDiary(new IDBFactory());
  await ensureFood(db, DEMO_MILK);
});

// Revision 1 of a one-food meal: 300 mL of the demo milk
function milkMeal(operationKey = 'save1'): MealRevision {
  return startMeal({
    mealId: 'm1',
    localDate: '2026-11-09',
    zone: 'Asia/Kuala_Lumpur',
    savedAt: '2026-11-09T07:40:00+08:00',
    operationKey,
    components: [
      { id: 'c1', foodId: 'demo_milk', foodVersion: 1, served: { amount: 300, unit: 'mL' }, eatenFraction: 1, active: true },
    ],
  });
}

// The milk correction 300 → 250 mL, based on revision 1
function correction(overrides: Partial<ChangeAmountRequest> = {}): ChangeAmountRequest {
  return {
    mealId: 'm1',
    expectedRevision: 1,
    componentId: 'c1',
    amount: { amount: 250, unit: 'mL' },
    operationKey: 'edit1',
    savedAt: '2026-11-09T07:52:00+08:00',
    ...overrides,
  };
}

describe('confirmMeal', () => {
  it('saves one meal even when the same save is sent twice', async () => {
    const first = await confirmMeal(db, milkMeal());
    const again = await confirmMeal(db, milkMeal());
    expect(first).toMatchObject({ status: 'saved', replayed: false });
    expect(again).toMatchObject({ status: 'saved', replayed: true });
    expect(await countMeals(db)).toBe(1);
    expect(await listRevisions(db, 'm1')).toHaveLength(1);
  });
});

describe('commitRevision', () => {
  it('adds revision 2 and moves the header pointer', async () => {
    await confirmMeal(db, milkMeal());
    const result = await commitRevision(db, correction());
    expect(result.status).toBe('saved');
    expect((await latestMeal(db))?.latestRevision).toBe(2);
    const history = await listRevisions(db, 'm1');
    expect(history.map((revision) => revision.components[0]?.served.amount)).toEqual([300, 250]);
  });

  it('returns the same revision when a correction is retried (golden C)', async () => {
    await confirmMeal(db, milkMeal());
    await commitRevision(db, correction());
    const retry = await commitRevision(db, correction());
    expect(retry).toMatchObject({ status: 'saved', replayed: true });
    expect(retry.status === 'saved' && retry.revision.revision).toBe(2);
    expect(await listRevisions(db, 'm1')).toHaveLength(2);
    expect(await countMeals(db)).toBe(1);
  });

  it('writes nothing for a stale correction (golden D)', async () => {
    await confirmMeal(db, milkMeal());
    await commitRevision(db, correction());
    const late = await commitRevision(db, correction({ operationKey: 'late1', amount: { amount: 150, unit: 'mL' } }));
    expect(late.status).toBe('conflict');
    expect(late.status === 'conflict' && late.latest.revision).toBe(2);
    expect(await listRevisions(db, 'm1')).toHaveLength(2);
  });

  it('lets a conflicting key be used again once the screen has refreshed', async () => {
    await confirmMeal(db, milkMeal());
    await commitRevision(db, correction());
    await commitRevision(db, correction({ operationKey: 'late1', amount: { amount: 150, unit: 'mL' } }));
    // A conflict does not burn the key, so the user's next attempt from revision 2 can save
    const retried = await commitRevision(db, correction({ operationKey: 'late1', expectedRevision: 2, amount: { amount: 150, unit: 'mL' } }));
    expect(retried.status === 'saved' && retried.revision.revision).toBe(3);
  });

  it('rolls back the whole transaction when the domain refuses the change', async () => {
    await confirmMeal(db, milkMeal());
    await expect(commitRevision(db, correction({ amount: { amount: NaN, unit: 'mL' } }))).rejects.toThrow(RangeError);
    expect((await latestMeal(db))?.latestRevision).toBe(1);
    expect(await listRevisions(db, 'm1')).toHaveLength(1);
  });

  it('refuses a correction for a meal that was never saved', async () => {
    await expect(commitRevision(db, correction())).rejects.toThrow(/not saved/);
  });

  it('refuses a correction whose unit does not fit the food label', async () => {
    await confirmMeal(db, milkMeal());
    const foods = new Map([[`${DEMO_MILK.id}@${DEMO_MILK.version}`, DEMO_MILK]]);
    // A replacement of 300 g against a millilitre label cannot be totalled, so nothing is saved
    const replacement = { id: 'c2', foodId: 'demo_milk', foodVersion: 1, served: { amount: 300, unit: 'g' as const }, eatenFraction: 1, active: true };
    await expect(
      commitEdit(db, { mealId: 'm1', expectedRevision: 1, operationKey: 'bad', savedAt: 'now', edit: { kind: 'replace_food', componentId: 'c1', replacement } }, foods),
    ).rejects.toThrow(/Cannot convert/);
    expect(await listRevisions(db, 'm1')).toHaveLength(1);
  });

  it('keeps everything after the database is closed and reopened', async () => {
    const factory = new IDBFactory();
    const first = await openDiary(factory);
    await confirmMeal(first, milkMeal());
    await commitRevision(first, correction());
    first.close();

    const reopened = await openDiary(factory);
    expect((await latestMeal(reopened))?.latestRevision).toBe(2);
    expect(await listRevisions(reopened, 'm1')).toHaveLength(2);
  });
});

describe('mealsOn and the version 2 upgrade', () => {
  it('returns only the meals of the requested date, with their latest revision', async () => {
    await confirmMeal(db, milkMeal());
    await commitRevision(db, correction());
    const day = await mealsOn(db, '2026-11-09');
    expect(day.map((meal) => meal.latest.revision)).toEqual([2]);
    expect(await mealsOn(db, '2026-11-10')).toEqual([]);
  });

  it('keeps meals saved under schema version 1 when the app upgrades', async () => {
    const factory = new IDBFactory();

    // Recreate what Milestone 1 left on the phone: version 1 stores, no date index
    const old = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open('health-companion', 1);
      request.onupgradeneeded = () => {
        const v1 = request.result;
        v1.createObjectStore('foods', { keyPath: ['id', 'version'] });
        v1.createObjectStore('meals', { keyPath: 'mealId' });
        v1.createObjectStore('revisions', { keyPath: ['mealId', 'revision'] });
        v1.createObjectStore('operations', { keyPath: 'operationKey' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await confirmMeal(old, milkMeal());
    old.close();

    // Opening with the current app runs only the version 2 step
    const upgraded = await openDiary(factory);
    expect(upgraded.version).toBe(2);
    expect((await mealsOn(upgraded, '2026-11-09')).map((meal) => meal.header.mealId)).toEqual(['m1']);
  });
});
