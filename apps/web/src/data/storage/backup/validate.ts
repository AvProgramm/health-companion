import { assertProfileSnapshot } from '../../../domain/profile/profile';
/**
 * Checking a backup file before anything is written.
 *
 * Each store has its own checker. They run in a fixed order because later stores
 * refer to earlier ones (a revision points at food versions, a meal at a revision),
 * so a new kind of record means adding one checker, not editing the others.
 */
import { assertCustomCard, latestCustomCards, MAX_CUSTOM_CARDS, type CustomCardSelection } from '../../../domain/training/customCards';
import { validateRanges } from '../../../domain/nutrition/estimates';
import type { FoodVersion } from '../../../domain/nutrition/types';
import { isUnit } from '../../../domain/shared/units';
import { DB_VERSION, STORE_NAMES, type StoreName } from '../connection';
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, OPTIONAL_LISTS, countBackup, type BackupCheck, type DiaryBackup } from './format';

// Stop listing problems after this many; the first few are enough to diagnose a bad file
const MAX_ERRORS = 20;

type Report = (message: string) => void;

// Keys collected from earlier stores, so later stores can check what they refer to
interface References {
  foodKeys: Set<string>;
  revisionKeys: Set<string>;
}

type StoreCheck = (records: readonly unknown[], references: References, report: Report) => void;

// One checker per store, in dependency order
const STORE_CHECKS: readonly { store: StoreName; check: StoreCheck }[] = [
  { store: 'foods', check: checkFoods },
  { store: 'revisions', check: checkRevisions },
  { store: 'meals', check: checkMeals },
  { store: 'operations', check: checkOperations },
  { store: 'workouts', check: checkWorkouts },
  { store: 'sleep', check: checkSleep },
  { store: 'customCards', check: checkCustomCards },
  { store: 'profile', check: checkProfile },
];

/**
 * Return whether parsed JSON is a complete, consistent backup, with every problem found.
 */
export function validateBackup(data: unknown): BackupCheck {
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

  // Every list must be present, except ones added after older backups were made
  for (const name of STORE_NAMES) {
    const optional = (OPTIONAL_LISTS as readonly string[]).includes(name);
    if (!Array.isArray(data[name]) && !(optional && data[name] === undefined)) {
      return { ok: false, errors: [`The backup has no "${name}" list.`] };
    }
  }

  // Fill in lists an older backup did not have, without changing the parsed file
  const backup = { ...data, workouts: data.workouts ?? [], sleep: data.sleep ?? [], customCards: data.customCards ?? [], profile: data.profile ?? [] } as unknown as DiaryBackup;

  // Run each store's checker, collecting at most MAX_ERRORS problems
  const errors: string[] = [];
  const report: Report = (message) => {
    if (errors.length < MAX_ERRORS) {
      errors.push(message);
    }
  };
  const references: References = { foodKeys: new Set(), revisionKeys: new Set() };
  for (const { store, check } of STORE_CHECKS) {
    check(backup[store], references, report);
  }

  // Return the problems, or the checked backup with its counts
  return errors.length > 0 ? { ok: false, errors } : { ok: true, backup, counts: countBackup(backup) };
}

/**
 * Check food versions and remember their keys for the revisions.
 */
function checkFoods(records: readonly unknown[], references: References, report: Report): void {
  for (const food of records) {
    if (!isRecord(food) || typeof food.id !== 'string' || !isPositiveInteger(food.version) || typeof food.name !== 'string') {
      report('A food is missing its ID, version or name.');
      continue;
    }
    const label = `Food ${food.name}`;
    if (!isRecord(food.basis) || !isUnit(food.basis.unit) || !isFiniteAbove(food.basis.amount, 0, false)) {
      report(`${label} has an invalid label amount or unit.`);
    }
    if (!isRecord(food.nutrients) || Object.values(food.nutrients).some((value) => value !== null && !isFiniteAbove(value, 0, true))) {
      report(`${label} has a nutrient that is not a number of 0 or more.`);
    }
    if (food.range !== undefined) {
      try {
        validateRanges(food.nutrients as FoodVersion['nutrients'], food.range);
      } catch {
        report(`${label} has invalid nutrient ranges.`);
      }
    }
    references.foodKeys.add(`${food.id}@${food.version}`);
  }
}

/**
 * Check meal revisions, their items and their food references, and remember their keys.
 */
function checkRevisions(records: readonly unknown[], references: References, report: Report): void {
  for (const revision of records) {
    if (!isRecord(revision) || typeof revision.mealId !== 'string' || !isPositiveInteger(revision.revision) || !Array.isArray(revision.components)) {
      report('A meal revision is missing its meal ID, number or items.');
      continue;
    }
    const label = `Meal ${revision.mealId} revision ${revision.revision}`;
    if (!isDiaryDate(revision.localDate)) {
      report(`${label} has an invalid date.`);
    }
    for (const component of revision.components as unknown[]) {
      if (!isRecord(component) || !isRecord(component.served) || !isUnit(component.served.unit) || !isFiniteAbove(component.served.amount, 0, true)) {
        report(`${label} has an item with an invalid amount or unit.`);
        continue;
      }
      if (!isFiniteAbove(component.eatenFraction, 0, true) || (component.eatenFraction as number) > 1) {
        report(`${label} has an eaten fraction outside 0–1.`);
      }
      if (!references.foodKeys.has(`${String(component.foodId)}@${String(component.foodVersion)}`)) {
        report(`${label} uses a food version that is not in the backup.`);
      }
    }
    references.revisionKeys.add(`${revision.mealId}@${revision.revision}`);
  }
}

/**
 * Check every meal header points at a revision in the file.
 */
function checkMeals(records: readonly unknown[], references: References, report: Report): void {
  for (const meal of records) {
    if (!isRecord(meal) || !references.revisionKeys.has(`${String(meal.mealId)}@${String(meal.latestRevision)}`)) {
      report(`Meal ${String(isRecord(meal) ? meal.mealId : '?')} points at a revision that is not in the backup.`);
    }
  }
}

/**
 * Check every used operation key points at a revision in the file.
 */
function checkOperations(records: readonly unknown[], references: References, report: Report): void {
  for (const operation of records) {
    if (!isRecord(operation) || typeof operation.operationKey !== 'string' || !references.revisionKeys.has(`${String(operation.mealId)}@${String(operation.revision)}`)) {
      report('An operation record points at a revision that is not in the backup.');
    }
  }
}

/**
 * Check workout entries and every number in their sets.
 */
function checkWorkouts(records: readonly unknown[], _references: References, report: Report): void {
  for (const workout of records) {
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
}

/**
 * Check sleep entries: times written as HH:MM and a positive duration.
 */
function checkSleep(records: readonly unknown[], _references: References, report: Report): void {
  for (const sleep of records) {
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


/** Check chosen exercise snapshots, complete version histories and operation uniqueness. */
function checkCustomCards(records: readonly unknown[], _references: References, report: Report): void {
  const valid: CustomCardSelection[] = [];
  const keys = new Set<string>();
  const operations = new Set<string>();
  for (const record of records) {
    try {
      assertCustomCard(record);
      const key = `${record.id}@${record.version}`;
      if (keys.has(key) || operations.has(record.operationKey)) throw new Error('An exercise snapshot or operation is duplicated.');
      keys.add(key);
      operations.add(record.operationKey);
      valid.push(record);
    } catch (problem) {
      report(problem instanceof Error ? problem.message : 'An exercise choice is invalid.');
    }
  }
  // Refuse incomplete histories before restore can create an uneditable selection.
  for (const latest of latestCustomCards(valid)) {
    const versions = valid.filter(record => record.id === latest.id).map(record => record.version).sort((left, right) => left - right);
    if (versions.some((version, index) => version !== index + 1)) report('An exercise choice has an incomplete version history.');
  }
  if (latestCustomCards(valid).filter(record => !record.deleted).length > MAX_CUSTOM_CARDS) report(`A backup can hold at most ${MAX_CUSTOM_CARDS} active added exercises.`);
}


/** Check profile identity, every stored field, operation uniqueness and complete history. */
function checkProfile(records: readonly unknown[], _references: References, report: Report): void {
  const versions = new Set<number>();
  const operations = new Set<string>();
  for (const record of records) {
    try {
      assertProfileSnapshot(record);
      // Ignore a duplicated key because restore cannot append it without losing a snapshot.
      if (versions.has(record.version) || operations.has(record.operationKey)) throw new Error('A profile version or operation is duplicated.');
      versions.add(record.version);
      operations.add(record.operationKey);
    } catch (problem) {
      report(problem instanceof Error ? problem.message : 'A profile snapshot is invalid.');
    }
  }
  // Require every previous version so the restored record has a complete immutable history.
  if ([...versions].sort((left, right) => left - right).some((version, index) => version !== index + 1)) {
    report('The profile has an incomplete version history.');
  }
}
