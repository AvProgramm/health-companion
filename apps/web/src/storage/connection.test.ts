import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { startMeal } from '../domain/meals/revisions';
import { MILK, TEST_FOOD_MAP } from '../test/testFoods';
import { DB_VERSION, openDiary } from './connection';
import { confirmMeal, mealsOn } from './mealsRepo';

/**
 * Open a database at an older version, with the stores Milestone 1 (v1) or 2 (v2) left on the phone.
 */
function openOldVersion(factory: IDBFactory, version: 1 | 2 | 3): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open('health-companion', version);
    request.onupgradeneeded = () => {
      const old = request.result;
      old.createObjectStore('foods', { keyPath: ['id', 'version'] });
      const meals = old.createObjectStore('meals', { keyPath: 'mealId' });
      old.createObjectStore('revisions', { keyPath: ['mealId', 'revision'] });
      old.createObjectStore('operations', { keyPath: 'operationKey' });
      // Version 2 added the date index on meals
      if (version >= 2) {
        meals.createIndex('byDate', 'localDate');
      }
      if (version >= 3) {
        const workouts = old.createObjectStore('workouts', { keyPath: 'id' });
        workouts.createIndex('byDate', 'localDate');
        workouts.createIndex('byMovement', 'movementKey');
        old.createObjectStore('sleep', { keyPath: 'id' }).createIndex('byDate', 'localDate');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// The meal an older build would have saved
const OLD_MEAL = startMeal({
  mealId: 'm1',
  localDate: '2026-11-09',
  zone: 'Asia/Kuala_Lumpur',
  savedAt: '2026-11-09T07:40:00+08:00',
  operationKey: 'save1',
  components: [{ id: 'c1', foodId: MILK.id, foodVersion: 1, served: { amount: 300, unit: 'mL' }, eatenFraction: 1, active: true }],
});

describe('upgrading an existing diary', () => {
  it.each([1, 2, 3] as const)('keeps meals saved under schema version %i and adds the later stores', async (version) => {
    const factory = new IDBFactory();

    // Save a meal with the older schema (version 1 had no date index, so write it directly)
    const old = await openOldVersion(factory, version);
    await new Promise<void>((resolve, reject) => {
      const tx = old.transaction(['meals', 'revisions'], 'readwrite');
      tx.objectStore('meals').add({ mealId: 'm1', localDate: '2026-11-09', createdAt: OLD_MEAL.savedAt, latestRevision: 1 });
      tx.objectStore('revisions').add(OLD_MEAL);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    old.close();

    // Opening with the current app runs every later step
    const upgraded = await openDiary(factory);
    expect(upgraded.version).toBe(DB_VERSION);
    expect([...upgraded.objectStoreNames].sort()).toEqual(['customCards', 'foods', 'meals', 'operations', 'revisions', 'sleep', 'workouts']);
    expect((await mealsOn(upgraded, '2026-11-09')).map((meal) => meal.header.mealId)).toEqual(['m1']);
  });

  it('opens an empty diary at the current version', async () => {
    const db = await openDiary(new IDBFactory());
    expect(db.version).toBe(DB_VERSION);
    expect(await confirmMeal(db, OLD_MEAL, TEST_FOOD_MAP)).toMatchObject({ status: 'saved' });
  });
});
