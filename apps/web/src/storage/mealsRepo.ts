/**
 * Meals and their revisions.
 *
 * Every write happens inside one readwrite transaction, so the revision, the meal's
 * latest-revision pointer and the operation key are saved together or not at all.
 * The domain decides what to write (reviseMeal); this file reads the current state
 * and stores the result.
 */
import { reviseMeal } from '../domain/meals/revisions';
import type { MealEditRequest, MealRevision } from '../domain/meals/types';
import { totalNutrient } from '../domain/nutrition/aggregate';
import { NUTRIENT_KEYS } from '../domain/nutrition/types';
import type { FoodVersion } from '../domain/nutrition/types';
import { resultOf, runTransaction } from './connection';

/**
 * The small header kept per meal, so the latest revision can be found in one read.
 */
export interface MealHeader {
  mealId: string;
  localDate: string;
  createdAt: string;
  latestRevision: number;
}

/**
 * A meal as the screen needs it: its header plus its latest revision.
 */
export interface SavedMeal {
  header: MealHeader;
  latest: MealRevision;
}

/**
 * The record that marks an operation key as used, pointing at the revision it produced.
 */
export interface OperationRecord {
  operationKey: string;
  mealId: string;
  revision: number;
}

export type CommitResult =
  | { status: 'saved'; revision: MealRevision; replayed: boolean }
  | { status: 'conflict'; latest: MealRevision };

/**
 * Save revision 1 of a new meal.
 *
 * If the operation key was used before, the stored revision is returned instead,
 * so a double tap on Save still creates exactly one meal. The meal must total
 * cleanly first (every food known, every unit fitting its label).
 */
export function confirmMeal(db: IDBDatabase, first: MealRevision, foods: ReadonlyMap<string, FoodVersion>): Promise<CommitResult> {
  // Check the meal can be totalled before opening the transaction
  assertTotalable(first, foods);

  return runTransaction(db, ['meals', 'revisions', 'operations'], (tx, finish) => {
    const operations = tx.objectStore('operations');
    const revisions = tx.objectStore('revisions');

    operations.get(first.operationKey).onsuccess = (event) => {
      // Replay an operation that already happened instead of saving a second meal
      const used = resultOf(event) as OperationRecord | undefined;
      if (used !== undefined) {
        revisions.get([used.mealId, used.revision]).onsuccess = (stored) =>
          finish({ status: 'saved', revision: resultOf(stored) as MealRevision, replayed: true });
        return;
      }

      // Save the header, the revision and the operation key together
      const header: MealHeader = { mealId: first.mealId, localDate: first.localDate, createdAt: first.savedAt, latestRevision: first.revision };
      tx.objectStore('meals').add(header);
      revisions.add(first);
      operations.add({ operationKey: first.operationKey, mealId: first.mealId, revision: first.revision });
      finish({ status: 'saved', revision: first, replayed: false });
    };
  });
}

/**
 * Apply one edit to the latest saved revision of a meal.
 *
 * Inside one transaction: replay a used operation key, otherwise read the latest
 * revision, let reviseMeal decide, check the result totals cleanly, and store the
 * new revision together with the header pointer and the operation key.
 * A conflict writes nothing.
 */
export function commitEdit(db: IDBDatabase, request: MealEditRequest, foods: ReadonlyMap<string, FoodVersion>): Promise<CommitResult> {
  return runTransaction(db, ['meals', 'revisions', 'operations'], (tx, finish, fail) => {
    const meals = tx.objectStore('meals');
    const revisions = tx.objectStore('revisions');
    const operations = tx.objectStore('operations');

    operations.get(request.operationKey).onsuccess = (event) => {
      // Replay an operation that already happened, so a retry returns the same revision
      const used = resultOf(event) as OperationRecord | undefined;
      if (used !== undefined) {
        revisions.get([used.mealId, used.revision]).onsuccess = (stored) =>
          finish({ status: 'saved', revision: resultOf(stored) as MealRevision, replayed: true });
        return;
      }

      meals.get(request.mealId).onsuccess = (mealEvent) => {
        const header = resultOf(mealEvent) as MealHeader | undefined;
        if (header === undefined) {
          fail(new Error(`Meal ${request.mealId} is not saved on this device`));
          return;
        }

        revisions.get([header.mealId, header.latestRevision]).onsuccess = (revisionEvent) => {
          const latest = resultOf(revisionEvent) as MealRevision;

          // Let the domain decide; a thrown error aborts the whole transaction
          let outcome;
          try {
            outcome = reviseMeal(latest, request);
            if (outcome.status === 'revised') {
              assertTotalable(outcome.next, foods);
            }
          } catch (error) {
            fail(error);
            return;
          }

          // Ignore a stale edit: write nothing and hand back the latest revision
          if (outcome.status === 'conflict') {
            finish({ status: 'conflict', latest: outcome.latest });
            return;
          }

          // Save the new revision, move the header pointer and mark the key as used
          const next = outcome.next;
          revisions.add(next);
          meals.put({ ...header, latestRevision: next.revision });
          operations.add({ operationKey: next.operationKey, mealId: next.mealId, revision: next.revision });
          finish({ status: 'saved', revision: next, replayed: false });
        };
      };
    };
  });
}

/**
 * Return the meals saved under one diary date, oldest first, each with its latest revision.
 */
export function mealsOn(db: IDBDatabase, localDate: string): Promise<SavedMeal[]> {
  return runTransaction(db, ['meals', 'revisions'], (tx, finish) => {
    const revisions = tx.objectStore('revisions');

    tx.objectStore('meals').index('byDate').getAll(localDate).onsuccess = (event) => {
      const headers = (resultOf(event) as MealHeader[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      if (headers.length === 0) {
        finish([]);
        return;
      }

      // Read each meal's latest revision; finish once the last one arrives
      const saved: SavedMeal[] = [];
      let remaining = headers.length;
      headers.forEach((header, index) => {
        revisions.get([header.mealId, header.latestRevision]).onsuccess = (revisionEvent) => {
          saved[index] = { header, latest: resultOf(revisionEvent) as MealRevision };
          remaining -= 1;
          if (remaining === 0) {
            finish(saved);
          }
        };
      });
    };
  }, 'readonly');
}

/**
 * Return every revision of a meal, oldest first.
 */
export function listRevisions(db: IDBDatabase, mealId: string): Promise<MealRevision[]> {
  return runTransaction(db, ['revisions'], (tx, finish) => {
    // The compound key sorts by mealId, then revision, so this range is already in order
    const range = IDBKeyRange.bound([mealId, 0], [mealId, Number.MAX_SAFE_INTEGER]);
    tx.objectStore('revisions').getAll(range).onsuccess = (event) => finish(resultOf(event) as MealRevision[]);
  }, 'readonly');
}

/**
 * Return the number of saved meals.
 */
export function countMeals(db: IDBDatabase): Promise<number> {
  return runTransaction(db, ['meals'], (tx, finish) => {
    tx.objectStore('meals').count().onsuccess = (event) => finish(resultOf(event) as number);
  }, 'readonly');
}

/**
 * Throw unless every nutrient of a revision can be totalled with these foods.
 *
 * Catches a missing food or a unit that does not fit its label before it is
 * saved, rather than when the day view later tries to add it up.
 */
function assertTotalable(revision: MealRevision, foods: ReadonlyMap<string, FoodVersion>): void {
  for (const nutrient of NUTRIENT_KEYS) {
    totalNutrient(revision, foods, nutrient);
  }
}
