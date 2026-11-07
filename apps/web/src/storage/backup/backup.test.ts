import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { startMeal } from '../../domain/meals/revisions';
import type { MealEditRequest } from '../../domain/meals/types';
import { summariseDay } from '../../domain/nutrition/day';
import { buildSleep, resolveSleep, type SleepEntry } from '../../domain/sleep/sleep';
import { buildWorkout, type WorkoutEntry } from '../../domain/training/workouts';
import { MILK, RICE, TEST_FOOD_MAP, WEETABIX } from '../../test/testFoods';
import { openDiary } from '../connection';
import { saveFoodVersion } from '../foodsRepo';
import { logsOn, saveLogEntry } from '../logsRepo';
import { commitEdit, confirmMeal, countMeals, listRevisions, mealsOn } from '../mealsRepo';
import type { DiaryBackup } from './format';
import { exportDiary, restoreDiary, wipeDiary } from './transfer';
import { validateBackup } from './validate';

let db: IDBDatabase;

// The breakfast milk correction, 300 → 250 mL
function milkCorrection(operationKey: string, expectedRevision = 1, amount = 250): MealEditRequest {
  return {
    mealId: 'breakfast',
    expectedRevision,
    operationKey,
    savedAt: '2026-11-09T07:52:00+08:00',
    edit: { kind: 'update_component', componentId: 'm', served: { amount, unit: 'mL' }, eatenFraction: 1 },
  };
}

// A diary on 9 Nov with two meals (one corrected), a gym session and a night's sleep
beforeEach(async () => {
  db = await openDiary(new IDBFactory());
  for (const food of [MILK, WEETABIX, RICE]) {
    await saveFoodVersion(db, food);
  }
  await confirmMeal(db, startMeal({
    mealId: 'breakfast', localDate: '2026-11-09', zone: 'Asia/Kuala_Lumpur', savedAt: '2026-11-09T07:40:00+08:00', operationKey: 'save1',
    components: [
      { id: 'w', foodId: WEETABIX.id, foodVersion: 1, served: { amount: 2, unit: 'piece' }, eatenFraction: 1, active: true },
      { id: 'm', foodId: MILK.id, foodVersion: 1, served: { amount: 300, unit: 'mL' }, eatenFraction: 1, active: true },
    ],
  }), TEST_FOOD_MAP);
  await commitEdit(db, milkCorrection('edit1'), TEST_FOOD_MAP);
  await confirmMeal(db, startMeal({
    mealId: 'lunch', localDate: '2026-11-09', zone: 'Asia/Kuala_Lumpur', savedAt: '2026-11-09T12:30:00+08:00', operationKey: 'save2',
    components: [{ id: 'r', foodId: RICE.id, foodVersion: 1, served: { amount: 180, unit: 'g' }, eatenFraction: 0.5, active: true }],
  }), TEST_FOOD_MAP);
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

// A validated copy of this device's diary, as if it went through a file
async function checkedExport() {
  const checked = validateBackup(JSON.parse(JSON.stringify(await exportDiary(db))));
  if (!checked.ok) {
    throw new Error(checked.errors.join('; '));
  }
  return checked;
}

describe('export and restore', () => {
  it('restores identical totals, history, workouts and sleep after a wipe', async () => {
    const before = await dayTotals(db);
    const checked = await checkedExport();
    expect(checked.counts).toEqual({ foods: 3, meals: 2, revisions: 3, workouts: 1, sleep: 1 });

    await wipeDiary(db);
    expect(await countMeals(db)).toBe(0);
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
    const checked = await checkedExport();
    await wipeDiary(db);
    await restoreDiary(db, checked);
    expect((await commitEdit(db, milkCorrection('late1', 1, 150), TEST_FOOD_MAP)).status).toBe('conflict');
  });

  it('still replays a used operation key after a restore', async () => {
    const checked = await checkedExport();
    await restoreDiary(db, checked);
    expect(await commitEdit(db, milkCorrection('edit1'), TEST_FOOD_MAP)).toMatchObject({ status: 'saved', replayed: true });
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
    expect(validateBackup({ ...(await validFile()), schemaVersion: 99 }).ok).toBe(false);
  });

  it('rejects a non-finite amount or an unknown unit before anything is written', async () => {
    const file = await validFile();
    file.revisions[0]!.components = [{ ...file.revisions[0]!.components[0]!, served: { amount: Number.NaN, unit: 'cup' as never } }];
    // JSON turns NaN into null, which must also be refused
    const check = validateBackup(JSON.parse(JSON.stringify(file)));
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
    const check = validateBackup(file);
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

describe('estimate backup compatibility', () => {
  it('round-trips estimate metadata without changing the schema version', async () => {
    const food = { ...RICE, id: 'fictional-estimate', source: { kind: 'database' as const, reference: 'Fictional source' }, range: { kcal: { low: 0, high: 1000 } } };
    await saveFoodVersion(db, food);
    const exported = await checkedExport();
    await wipeDiary(db);
    await restoreDiary(db, exported);
    const restored = await exportDiary(db);
    expect(restored.foods.find((item) => item.id === food.id)).toEqual(food);
  });

  it('rejects inverted ranges before restoring anything', async () => {
    const backup = await exportDiary(db);
    backup.foods[0]!.range = { kcal: { low: 900, high: 100 } };
    expect(validateBackup(backup).ok).toBe(false);
  });
});
