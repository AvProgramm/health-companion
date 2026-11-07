/**
 * The on-device diary database (IndexedDB, schema version 2).
 *
 * Every write that changes a meal happens inside one readwrite transaction, so the
 * revision, the meal's latest-revision pointer and the operation key are saved
 * together or not at all. The domain functions decide what to write; this file
 * only reads the current state and stores the result.
 */
import { SUMMARY_NUTRIENTS } from '../domain/day';
import { totalNutrient } from '../domain/aggregate';
import { reviseMeal } from '../domain/revisions';
import type { ChangeAmountRequest, FoodVersion, MealEditRequest, MealRevision } from '../domain/types';

// Bump only together with a new step in upgradeSchema
const DB_NAME = 'health-companion';
export const DB_VERSION = 2;

// Every store, in the order a backup lists them
export const STORE_NAMES = ['foods', 'meals', 'revisions', 'operations'] as const;

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
 * Open the diary database, creating or upgrading the stores as needed.
 *
 * The factory is a parameter so the tests can pass an in-memory IndexedDB.
 */
export function openDiary(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => upgradeSchema(request.result, request.transaction!, event.oldVersion);
    request.onsuccess = () => {
      const db = request.result;
      // Close when a newer version of the app opens in another tab, so its upgrade is not blocked
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    // Another tab holding an older version open would block the upgrade forever
    request.onblocked = () => reject(new Error('Close other Health Companion tabs and reload'));
  });
}

/**
 * Bring the stores up to the current schema, one version step at a time.
 *
 * A phone that still has version 1 data runs only the version 2 step, so its
 * saved meals are kept and gain the date index.
 */
function upgradeSchema(db: IDBDatabase, tx: IDBTransaction, oldVersion: number): void {
  // Version 1: the stores themselves
  if (oldVersion < 1) {
    // Foods are versioned, so an old meal keeps pointing at the label it was saved with
    db.createObjectStore('foods', { keyPath: ['id', 'version'] });
    // One header per meal, plus every revision it has ever had
    db.createObjectStore('meals', { keyPath: 'mealId' });
    db.createObjectStore('revisions', { keyPath: ['mealId', 'revision'] });
    // Used operation keys, so a retried save or double tap is recognised
    db.createObjectStore('operations', { keyPath: 'operationKey' });
  }

  // Version 2: find a day's meals without reading every meal
  if (oldVersion < 2) {
    tx.objectStore('meals').createIndex('byDate', 'localDate');
  }
}

/**
 * Save a food version if it is not stored yet; an existing version is never overwritten.
 */
export function ensureFood(db: IDBDatabase, food: FoodVersion): Promise<void> {
  return runTransaction<void>(db, ['foods'], (tx, finish) => {
    const foods = tx.objectStore('foods');
    foods.get([food.id, food.version]).onsuccess = (event) => {
      // Ignore a food that is already saved, so its label stays exactly as first recorded
      if (resultOf(event) === undefined) {
        foods.add(food);
      }
      finish(undefined);
    };
  });
}

/**
 * Save a new food version; fails if that exact version already exists.
 */
export function saveFoodVersion(db: IDBDatabase, food: FoodVersion): Promise<void> {
  return runTransaction<void>(db, ['foods'], (tx, finish) => {
    tx.objectStore('foods').add(food);
    finish(undefined);
  });
}

/**
 * Return every saved food version.
 */
export function listFoods(db: IDBDatabase): Promise<FoodVersion[]> {
  return runTransaction(db, ['foods'], (tx, finish) => {
    tx.objectStore('foods').getAll().onsuccess = (event) => finish(resultOf(event) as FoodVersion[]);
  }, 'readonly');
}

/**
 * Save revision 1 of a new meal.
 *
 * If the operation key was used before, the stored revision is returned instead,
 * so a double tap on Save still creates exactly one meal. When foods are given,
 * the meal must total cleanly first (every food known, every unit fitting its label).
 */
export function confirmMeal(db: IDBDatabase, first: MealRevision, foods?: ReadonlyMap<string, FoodVersion>): Promise<CommitResult> {
  // Check the meal can be totalled before opening the transaction
  if (foods !== undefined) {
    assertTotalable(first, foods);
  }

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
      const header: MealHeader = {
        mealId: first.mealId,
        localDate: first.localDate,
        createdAt: first.savedAt,
        latestRevision: first.revision,
      };
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
export function commitEdit(db: IDBDatabase, request: MealEditRequest, foods?: ReadonlyMap<string, FoodVersion>): Promise<CommitResult> {
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
            if (outcome.status === 'revised' && foods !== undefined) {
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
 * Apply a change-amount request; the Milestone 1 correction, kept for its tests.
 */
export function commitRevision(db: IDBDatabase, request: ChangeAmountRequest): Promise<CommitResult> {
  return commitEdit(db, {
    mealId: request.mealId,
    expectedRevision: request.expectedRevision,
    operationKey: request.operationKey,
    savedAt: request.savedAt,
    edit: { kind: 'change_amount', componentId: request.componentId, amount: request.amount },
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
 * Return the most recently created meal's header, or undefined on an empty diary.
 */
export function latestMeal(db: IDBDatabase): Promise<MealHeader | undefined> {
  return runTransaction(db, ['meals'], (tx, finish) => {
    tx.objectStore('meals').getAll().onsuccess = (event) => {
      const headers = resultOf(event) as MealHeader[];
      // Sort newest first; ISO timestamps sort correctly as text
      headers.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      finish(headers[0]);
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
 * Permanently remove every food, meal, revision and operation key from this device.
 */
export function wipeDiary(db: IDBDatabase): Promise<void> {
  return runTransaction<void>(db, [...STORE_NAMES], (tx, finish) => {
    for (const name of STORE_NAMES) {
      tx.objectStore(name).clear();
    }
    finish(undefined);
  });
}

/**
 * Throw unless every nutrient of a revision can be totalled with these foods.
 *
 * Catches a missing food or a unit that does not fit its label before it is
 * saved, rather than when the day view later tries to add it up.
 */
function assertTotalable(revision: MealRevision, foods: ReadonlyMap<string, FoodVersion>): void {
  for (const nutrient of SUMMARY_NUTRIENTS) {
    totalNutrient(revision, foods, nutrient);
  }
}

/**
 * Run one transaction and settle the promise only once it has fully committed.
 *
 * Resolving on "complete" (not on the last request) means the caller is only told
 * "saved" after the browser has accepted the whole write. Strict durability asks
 * the browser to flush to disk before reporting completion.
 */
export function runTransaction<T>(
  db: IDBDatabase,
  storeNames: string[],
  body: (tx: IDBTransaction, finish: (value: T) => void, fail: (error: unknown) => void) => void,
  mode: IDBTransactionMode = 'readwrite',
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeNames, mode, { durability: 'strict' });
    let value: T | undefined;
    let failure: unknown;

    tx.oncomplete = () => resolve(value as T);
    tx.onerror = () => reject(failure ?? tx.error);
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('Transaction aborted'));

    body(
      tx,
      (result) => {
        value = result;
      },
      (error) => {
        // Abort so nothing from this transaction is kept
        failure = error;
        tx.abort();
      },
    );
  });
}

/**
 * Return the result of a finished IndexedDB request event.
 */
export function resultOf(event: Event): unknown {
  return (event.target as IDBRequest).result;
}
