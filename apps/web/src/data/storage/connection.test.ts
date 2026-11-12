import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { startMeal } from '../../domain/meals/revisions';
import { MILK, TEST_FOOD_MAP } from '../../test/testFoods';
import { DB_VERSION, DIARY_NAME, openDiary } from './connection';
import { confirmMeal, mealsOn } from './mealsRepo';

/**
 * Open a database at an older version, with the stores Milestone 1 (v1) or 2 (v2) left on the phone.
 */
function openOldVersion(factory: IDBFactory, version: 1 | 2 | 3 | 4): Promise<IDBDatabase> {
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
      if (version >= 4) {
        old.createObjectStore('customCards', { keyPath: ['id', 'version'] }).createIndex('byOperationKey', 'operationKey', { unique: true });
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
  it.each([1, 2, 3, 4] as const)('keeps meals saved under schema version %i and adds the later stores', async (version) => {
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
    // Keep a legacy chosen-exercise snapshot byte-for-byte, including its unknown adaptation facts.
    const legacyChoice = { id: 'free-exercise-db:fictional-old', version: 1, operationKey: 'old-choice', card: { name: 'Fictional old choice' } };
    if (version === 4) await new Promise<void>((resolve, reject) => {
      const tx = old.transaction('customCards', 'readwrite');
      tx.objectStore('customCards').add(legacyChoice);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    old.close();

    // Opening with the current app runs every later step
    const upgraded = await openDiary(DIARY_NAME, factory);
    expect(upgraded.version).toBe(DB_VERSION);
    if (version === 4) {
      const choices = await new Promise(resolve => {
        const request = upgraded.transaction('customCards').objectStore('customCards').getAll();
        request.onsuccess = () => resolve(request.result);
      });
      expect(choices).toEqual([legacyChoice]);
    }
    expect([...upgraded.objectStoreNames].sort()).toEqual(['customCards', 'foods', 'meals', 'operations', 'profile', 'revisions', 'sleep', 'workouts']);
    expect((await mealsOn(upgraded, '2026-11-09')).map((meal) => meal.header.mealId)).toEqual(['m1']);
  });

  it.each([3, 4] as const)('keeps version-%i workout and sleep records unchanged when adding later stores', async version => {
    // Store fictional records directly, as the previous build would have left them.
    const factory = new IDBFactory();
    const old = await openOldVersion(factory, version);
    const workout = { id: 'fictional-workout', localDate: '2026-11-07', movementKey: 'fictional-row', sets: [{ reps: 8, load: null }] };
    const sleep = { id: 'fictional-sleep', localDate: '2026-11-07', asleepMin: null, timeInBedMin: 450 };
    await new Promise<void>((resolve, reject) => {
      const tx = old.transaction(['workouts', 'sleep'], 'readwrite');
      tx.objectStore('workouts').add(workout);
      tx.objectStore('sleep').add(sleep);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    old.close();
    // Compare the stored snapshots byte-for-byte after the additive upgrade.
    const upgraded = await openDiary(DIARY_NAME, factory);
    for (const [store, entry] of [['workouts', workout], ['sleep', sleep]] as const) {
      const record = await new Promise(resolve => {
        const request = upgraded.transaction(store).objectStore(store).get(entry.id);
        request.onsuccess = () => resolve(request.result);
      });
      expect(record).toEqual(entry);
    }
    upgraded.close();
  });

  it('opens an empty diary at the current version', async () => {
    const db = await openDiary(DIARY_NAME, new IDBFactory());
    expect(db.version).toBe(DB_VERSION);
    expect(await confirmMeal(db, OLD_MEAL, TEST_FOOD_MAP)).toMatchObject({ status: 'saved' });
  });
});
