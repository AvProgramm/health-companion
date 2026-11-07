import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { summariseDay } from '../domain/day';
import { startMeal } from '../domain/revisions';
import { buildSleep, resolveSleep, type SleepEntry } from '../domain/sleep';
import { MILK, RICE, TEST_FOOD_MAP, WEETABIX } from '../domain/testFoods';
import { buildWorkout, type WorkoutEntry } from '../domain/workouts';
import { exportDiary, restoreDiary, validateBackup, type DiaryBackup } from './backup';
import { commitEdit, confirmMeal, countMeals, ensureFood, listRevisions, logsOn, mealsOn, openDiary, saveLogEntry, wipeDiary } from './db';

let db: IDBDatabase;

// A diary with two meals on 9 Nov, one of them corrected
beforeEach(async () => {
  db = await openDiary(new IDBFactory());
  for (const food of [MILK, WEETABIX, RICE]) {
    await ensureFood(db, food);
  }
  await confirmMeal(db, startMeal({
    mealId: 'breakfast', localDate: '2026-11-09', zone: 'Asia/Kuala_Lumpur', savedAt: '2026-11-09T07:40:00+08:00', operationKey: 'save1',
    components: [
      { id: 'w', foodId: WEETABIX.id, foodVersion: 1, served: { amount: 2, unit: 'piece' }, eatenFraction: 1, active: true },
      { id: 'm', foodId: MILK.id, foodVersion: 1, served: { amount: 300, unit: 'mL' }, eatenFraction: 1, active: true },
    ],
  }), TEST_FOOD_MAP);
  await commitEdit(db, { mealId: 'breakfast', expectedRevision: 1, operationKey: 'edit1', savedAt: '2026-11-09T07:52:00+08:00', edit: { kind: 'change_amount', componentId: 'm', amount: { amount: 250, unit: 'mL' } } }, TEST_FOOD_MAP);
  await confirmMeal(db, startMeal({
    mealId: 'lunch', localDate: '2026-11-09', zone: 'Asia/Kuala_Lumpur', savedAt: '2026-11-09T12:30:00+08:00', operationKey: 'save2',
    components: [{ id: 'r', foodId: RICE.id, foodVersion: 1, served: { amount: 180, unit: 'g' }, eatenFraction: 0.5, active: true }],
  }), TEST_FOOD_MAP);

  // One gym session and one night's sleep, so the round trip covers every store
  await saveLogEntry(db, 'workouts', buildWorkout(
    { movement: 'Row', status: 'done', sets: [{ reps: 8, load: 5, loadUnit: 'kg', perHand: true, minutes: null, distanceKm: null }] },
    { id: 'row-1', operationKey: 'w1', localDate: '2026-11-09', zone: 'Asia/Kuala_Lumpur', savedAt: '2026-11-09T18:00:00+08:00' },
  ));
  const night = resolveSleep('2026-11-09', { hour: 23, minute: 30, meridiem: null }, { hour: 7, minute: 0, meridiem: null });
  await saveLogEntry(db, 'sleep', buildSleep(night, null, { id: 's1', operationKey: 's1', zone: 'Asia/Kuala_Lumpur', savedAt: '2026-11-09T07:30:00+08:00' }));
});

// The day's totals as the screen would compute them
async function dayTotals(database: IDBDatabase) {
  const meals = await mealsOn(database, '2026-11-09');
  return summariseDay('2026-11-09', meals.map((meal) => meal.latest), TEST_FOOD_MAP);
}

describe('export and restore', () => {
  it('restores identical totals and revision history after a wipe', async () => {
    const before = await dayTotals(db);
    const file = JSON.parse(JSON.stringify(await exportDiary(db)));

    await wipeDiary(db);
    expect(await countMeals(db)).toBe(0);

    const checked = validateBackup(file);
    if (!checked.ok) {
      throw new Error(checked.errors.join('; '));
    }
    expect(checked.counts).toEqual({ foods: 3, meals: 2, revisions: 3, workouts: 1, sleep: 1 });
    await restoreDiary(db, checked);

    expect(await dayTotals(db)).toEqual(before);
    expect(await listRevisions(db, 'breakfast')).toHaveLength(2);
    expect((await logsOn<WorkoutEntry>(db, 'workouts', '2026-11-09')).map((entry) => entry.movement)).toEqual(['Row']);
    expect((await logsOn<SleepEntry>(db, 'sleep', '2026-11-09')).map((entry) => entry.timeInBedMin)).toEqual([450]);
  });

  it('restores a Milestone 2 backup that has no workout or sleep lists', async () => {
    const file = JSON.parse(JSON.stringify(await exportDiary(db)));
    delete file.workouts;
    delete file.sleep;
    file.schemaVersion = 2;

    const checked = validateBackup(file);
    expect(checked.ok ? checked.counts : checked.errors).toEqual({ foods: 3, meals: 2, revisions: 3, workouts: 0, sleep: 0 });
  });

  it('still rejects a stale correction after a restore', async () => {
    const checked = validateBackup(JSON.parse(JSON.stringify(await exportDiary(db))));
    if (!checked.ok) {
      throw new Error('Backup should validate');
    }
    await wipeDiary(db);
    await restoreDiary(db, checked);

    const stale = await commitEdit(db, { mealId: 'breakfast', expectedRevision: 1, operationKey: 'late1', savedAt: '2026-11-09T09:00:00+08:00', edit: { kind: 'change_amount', componentId: 'm', amount: { amount: 150, unit: 'mL' } } });
    expect(stale.status).toBe('conflict');
  });

  it('still replays a used operation key after a restore', async () => {
    const checked = validateBackup(JSON.parse(JSON.stringify(await exportDiary(db))));
    if (!checked.ok) {
      throw new Error('Backup should validate');
    }
    await restoreDiary(db, checked);
    const retry = await commitEdit(db, { mealId: 'breakfast', expectedRevision: 1, operationKey: 'edit1', savedAt: 'later', edit: { kind: 'change_amount', componentId: 'm', amount: { amount: 250, unit: 'mL' } } });
    expect(retry).toMatchObject({ status: 'saved', replayed: true });
  });
});

describe('validateBackup', () => {
  // A fresh, valid export to break in different ways
  async function validFile(): Promise<DiaryBackup> {
    return JSON.parse(JSON.stringify(await exportDiary(db))) as DiaryBackup;
  }

  it('rejects something that is not a backup', () => {
    expect(validateBackup({ hello: 'world' })).toEqual({ ok: false, errors: ['This is not a Health Companion backup file.'] });
    expect(validateBackup(null).ok).toBe(false);
  });

  it('rejects a backup from a newer schema', async () => {
    const file = { ...(await validFile()), schemaVersion: 99 };
    expect(validateBackup(file).ok).toBe(false);
  });

  it('rejects a non-finite amount or an unknown unit before anything is written', async () => {
    const file = await validFile();
    file.revisions[0]!.components = [{ ...file.revisions[0]!.components[0]!, served: { amount: Number.NaN, unit: 'cup' as never } }];
    // JSON turns NaN into null, which must also be refused
    const check = validateBackup(JSON.parse(JSON.stringify(file)));
    expect(check.ok).toBe(false);
    expect(check.ok ? [] : check.errors[0]).toMatch(/invalid amount or unit/);
    // Nothing was touched
    expect(await countMeals(db)).toBe(2);
  });

  it('rejects a meal that points at a missing revision or food', async () => {
    const file = await validFile();
    file.foods = file.foods.filter((food) => food.id !== RICE.id);
    file.meals[0]!.latestRevision = 9;
    const check = validateBackup(file);
    expect(check.ok ? [] : check.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/food version that is not in the backup/), expect.stringMatching(/points at a revision/)]),
    );
  });

  it('rejects a workout with a negative load or a sleep with no duration', async () => {
    const file = await validFile();
    file.workouts[0]!.sets = [{ ...file.workouts[0]!.sets[0]!, load: -5 }];
    file.sleep[0]!.timeInBedMin = 0;
    const check = validateBackup(JSON.parse(JSON.stringify(file)));
    expect(check.ok ? [] : check.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/Workout row-1 has a set/), expect.stringMatching(/Sleep s1 has an invalid duration/)]),
    );
  });

  it('rejects a negative nutrient', async () => {
    const file = await validFile();
    file.foods[0]!.nutrients = { kcal: -5 };
    expect(validateBackup(file).ok).toBe(false);
  });
});
