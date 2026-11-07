/**
 * Export the whole diary to a JSON file, and restore it after checking every record.
 *
 * Restoring replaces this device's diary in one transaction, and only after the
 * file has passed validation, so a damaged or foreign file can never leave the
 * diary half-restored.
 */
import type { SleepEntry } from '../domain/sleep';
import type { FoodVersion, MealRevision } from '../domain/types';
import { isUnit } from '../domain/units';
import type { WorkoutEntry } from '../domain/workouts';
import { DB_VERSION, STORE_NAMES, resultOf, runTransaction, type MealHeader, type OperationRecord } from './db';

// Lists added after the first backups were made; an older file without them restores them as empty
const OPTIONAL_LISTS = ['workouts', 'sleep'] as const;

// Identifies our backup files, so a random JSON file is rejected straight away
export const BACKUP_FORMAT = 'health-companion-backup';
export const BACKUP_FORMAT_VERSION = 1;

// Stop listing problems after this many; the first few are enough to diagnose a bad file
const MAX_ERRORS = 20;

export interface DiaryBackup {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  schemaVersion: number;
  exportedAt: string;
  foods: FoodVersion[];
  meals: MealHeader[];
  revisions: MealRevision[];
  operations: OperationRecord[];
  workouts: WorkoutEntry[];
  sleep: SleepEntry[];
}

export interface BackupCounts {
  foods: number;
  meals: number;
  revisions: number;
  workouts: number;
  sleep: number;
}

export type BackupCheck =
  | { ok: true; backup: DiaryBackup; counts: BackupCounts }
  | { ok: false; errors: string[] };

/**
 * Return every record on this device as one backup object, read in a single snapshot.
 */
export function exportDiary(db: IDBDatabase, now: Date = new Date()): Promise<DiaryBackup> {
  return runTransaction(db, [...STORE_NAMES], (tx, finish) => {
    const backup: DiaryBackup = {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      schemaVersion: DB_VERSION,
      exportedAt: now.toISOString(),
      foods: [],
      meals: [],
      revisions: [],
      operations: [],
      workouts: [],
      sleep: [],
    };

    // Read every store; finish once the last one arrives
    let remaining = STORE_NAMES.length;
    for (const name of STORE_NAMES) {
      tx.objectStore(name).getAll().onsuccess = (event) => {
        (backup[name] as unknown[]) = resultOf(event) as unknown[];
        remaining -= 1;
        if (remaining === 0) {
          finish(backup);
        }
      };
    }
  }, 'readonly');
}

/**
 * Return the counts of records in a backup, for the "this will restore…" message.
 */
export function countBackup(backup: DiaryBackup): BackupCounts {
  return {
    foods: backup.foods.length,
    meals: backup.meals.length,
    revisions: backup.revisions.length,
    workouts: backup.workouts.length,
    sleep: backup.sleep.length,
  };
}

/**
 * Return whether parsed JSON is a complete, consistent backup, with every problem found.
 *
 * Checks the file marker, every unit and number, and that every reference points at a
 * record in the same file: each meal's latest revision, each component's food version,
 * and each operation key's revision.
 */
export function validateBackup(data: unknown): BackupCheck {
  const errors: string[] = [];
  const report = (message: string) => {
    if (errors.length < MAX_ERRORS) {
      errors.push(message);
    }
  };

  // Check the file marker and versions before reading anything else
  if (!isRecord(data) || data.format !== BACKUP_FORMAT) {
    return { ok: false, errors: ['This is not a Health Companion backup file.'] };
  }
  if (data.formatVersion !== BACKUP_FORMAT_VERSION) {
    return { ok: false, errors: [`Backup format ${String(data.formatVersion)} is not supported by this version of the app.`] };
  }
  if (typeof data.schemaVersion !== 'number' || data.schemaVersion > DB_VERSION) {
    return { ok: false, errors: ['This backup comes from a newer version of the app. Update the app first.'] };
  }
  for (const name of STORE_NAMES) {
    const optional = (OPTIONAL_LISTS as readonly string[]).includes(name);
    if (!Array.isArray(data[name]) && !(optional && data[name] === undefined)) {
      return { ok: false, errors: [`The backup has no "${name}" list.`] };
    }
  }
  // Fill in lists an older backup did not have, without changing the parsed file
  const backup = { ...data, workouts: data.workouts ?? [], sleep: data.sleep ?? [] } as unknown as DiaryBackup;

  // Check each workout entry
  for (const workout of backup.workouts) {
    if (!isRecord(workout) || typeof workout.id !== 'string' || !isDiaryDate(workout.localDate) || !isPositiveInteger(workout.version)) {
      report('A workout is missing its ID, date or version.');
      continue;
    }
    if (typeof workout.movement !== 'string' || (workout.status !== 'done' && workout.status !== 'skipped') || !Array.isArray(workout.sets)) {
      report(`Workout ${workout.id} has an invalid movement, status or sets.`);
      continue;
    }
    for (const set of workout.sets as unknown[]) {
      const numbers = isRecord(set) ? [set.reps, set.load, set.minutes, set.distanceKm] : [Number.NaN];
      if (numbers.some((value) => value !== null && !isFiniteAbove(value, 0, true))) {
        report(`Workout ${workout.id} has a set with a number that is not 0 or more.`);
      }
      if (isRecord(set) && set.loadUnit !== null && set.loadUnit !== 'kg' && set.loadUnit !== 'lb') {
        report(`Workout ${workout.id} has a load unit other than kg or lb.`);
      }
    }
  }

  // Check each sleep entry
  for (const sleep of backup.sleep) {
    if (!isRecord(sleep) || typeof sleep.id !== 'string' || !isDiaryDate(sleep.localDate) || !isPositiveInteger(sleep.version)) {
      report('A sleep entry is missing its ID, date or version.');
      continue;
    }
    if (!isFiniteAbove(sleep.timeInBedMin, 0, false) || (sleep.asleepMin !== null && !isFiniteAbove(sleep.asleepMin, 0, false))) {
      report(`Sleep ${sleep.id} has an invalid duration.`);
    }
    if (typeof sleep.bedTime !== 'string' || typeof sleep.wakeTime !== 'string' || !/^\d{2}:\d{2}$/.test(sleep.bedTime) || !/^\d{2}:\d{2}$/.test(sleep.wakeTime)) {
      report(`Sleep ${sleep.id} has an invalid bed or wake time.`);
    }
  }

  // Check each food version
  const foodKeys = new Set<string>();
  for (const food of backup.foods) {
    const label = `Food ${String(food?.name ?? food?.id)}`;
    if (!isRecord(food) || typeof food.id !== 'string' || !isPositiveInteger(food.version) || typeof food.name !== 'string') {
      report(`${label} is missing its ID, version or name.`);
      continue;
    }
    if (!isRecord(food.basis) || !isUnit(food.basis.unit) || !isFiniteAbove(food.basis.amount, 0, false)) {
      report(`${label} has an invalid label amount or unit.`);
    }
    if (!isRecord(food.nutrients) || Object.values(food.nutrients).some((value) => value !== null && !isFiniteAbove(value, 0, true))) {
      report(`${label} has a nutrient that is not a number of 0 or more.`);
    }
    foodKeys.add(`${food.id}@${food.version}`);
  }

  // Check each revision and its components
  const revisionKeys = new Set<string>();
  for (const revision of backup.revisions) {
    if (!isRecord(revision) || typeof revision.mealId !== 'string' || !isPositiveInteger(revision.revision) || !Array.isArray(revision.components)) {
      report('A meal revision is missing its meal ID, number or items.');
      continue;
    }
    const label = `Meal ${revision.mealId} revision ${revision.revision}`;
    if (!isDiaryDate(revision.localDate)) {
      report(`${label} has an invalid date.`);
    }
    for (const component of revision.components) {
      if (!isRecord(component) || !isRecord(component.served) || !isUnit(component.served.unit) || !isFiniteAbove(component.served.amount, 0, true)) {
        report(`${label} has an item with an invalid amount or unit.`);
        continue;
      }
      if (!isFiniteAbove(component.eatenFraction, 0, true) || (component.eatenFraction as number) > 1) {
        report(`${label} has an eaten fraction outside 0–1.`);
      }
      if (!foodKeys.has(`${String(component.foodId)}@${String(component.foodVersion)}`)) {
        report(`${label} uses a food version that is not in the backup.`);
      }
    }
    revisionKeys.add(`${revision.mealId}@${revision.revision}`);
  }

  // Check every meal points at a revision in the file
  for (const meal of backup.meals) {
    if (!isRecord(meal) || !revisionKeys.has(`${String(meal.mealId)}@${String(meal.latestRevision)}`)) {
      report(`Meal ${String(isRecord(meal) ? meal.mealId : '?')} points at a revision that is not in the backup.`);
    }
  }

  // Check every operation key points at a revision in the file
  for (const operation of backup.operations) {
    if (!isRecord(operation) || typeof operation.operationKey !== 'string' || !revisionKeys.has(`${String(operation.mealId)}@${String(operation.revision)}`)) {
      report('An operation record points at a revision that is not in the backup.');
    }
  }

  // Return the problems, or the checked backup with its counts
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, backup, counts: countBackup(backup) };
}

/**
 * Replace everything on this device with a validated backup, in one transaction.
 *
 * Only accepts the result of validateBackup, so an unchecked file cannot reach here.
 */
export function restoreDiary(db: IDBDatabase, checked: Extract<BackupCheck, { ok: true }>): Promise<BackupCounts> {
  const { backup } = checked;
  return runTransaction(db, [...STORE_NAMES], (tx, finish) => {
    // Clear each store, then add the backup's records to it
    for (const name of STORE_NAMES) {
      const store = tx.objectStore(name);
      store.clear();
      for (const record of backup[name]) {
        store.add(record);
      }
    }
    finish(countBackup(backup));
  });
}

/**
 * Return true for a plain object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Return true for a diary date written as YYYY-MM-DD.
 */
function isDiaryDate(value: unknown): boolean {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Return true for an integer of 1 or more.
 */
function isPositiveInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

/**
 * Return true for a finite number above the minimum (or equal to it when allowed).
 */
function isFiniteAbove(value: unknown, minimum: number, allowEqual: boolean): boolean {
  return typeof value === 'number' && Number.isFinite(value) && (allowEqual ? value >= minimum : value > minimum);
}
