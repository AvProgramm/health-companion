/**
 * The on-device diary database (IndexedDB, schema version 1).
 *
 * Every write that changes a meal happens inside one readwrite transaction, so the
 * revision, the meal's latest-revision pointer and the operation key are saved
 * together or not at all. The domain functions decide what to write; this file
 * only reads the current state and stores the result.
 */
import { reviseAmount } from '../domain/revisions';
import type { ChangeAmountRequest, FoodVersion, MealRevision } from '../domain/types';

// Bump only together with a migration in upgradeSchema
const DB_NAME = 'health-companion';
const DB_VERSION = 1;

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
 * The record that marks an operation key as used, pointing at the revision it produced.
 */
interface OperationRecord {
  operationKey: string;
  mealId: string;
  revision: number;
}

export type CommitResult =
  | { status: 'saved'; revision: MealRevision; replayed: boolean }
  | { status: 'conflict'; latest: MealRevision };

/**
 * Open the diary database, creating the stores on first use.
 *
 * The factory is a parameter so the tests can pass an in-memory IndexedDB.
 */
export function openDiary(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => upgradeSchema(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    // Another tab holding an older version open would block the upgrade forever
    request.onblocked = () => reject(new Error('Close other Health Companion tabs and reload'));
  });
}

/**
 * Create the object stores for schema version 1.
 */
function upgradeSchema(db: IDBDatabase): void {
  // Foods are versioned, so an old meal keeps pointing at the label it was saved with
  db.createObjectStore('foods', { keyPath: ['id', 'version'] });

  // One header per meal, plus every revision it has ever had
  db.createObjectStore('meals', { keyPath: 'mealId' });
  db.createObjectStore('revisions', { keyPath: ['mealId', 'revision'] });

  // Used operation keys, so a retried save or double tap is recognised
  db.createObjectStore('operations', { keyPath: 'operationKey' });
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
 * so a double tap on Save still creates exactly one meal.
 */
export function confirmMeal(db: IDBDatabase, first: MealRevision): Promise<CommitResult> {
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
 * Apply a change-amount request to the latest saved revision of a meal.
 *
 * Inside one transaction: replay a used operation key, otherwise read the latest
 * revision, let reviseAmount decide, and store the new revision together with the
 * header pointer and the operation key. A conflict writes nothing.
 */
export function commitRevision(db: IDBDatabase, request: ChangeAmountRequest): Promise<CommitResult> {
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

          // Let the domain function decide; a thrown error aborts the whole transaction
          let outcome;
          try {
            outcome = reviseAmount(latest, request);
          } catch (error) {
            fail(error);
            return;
          }

          // Ignore a stale change: write nothing and hand back the latest revision
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
 * Run one transaction and settle the promise only once it has fully committed.
 *
 * Resolving on "complete" (not on the last request) means the caller is only told
 * "saved" after the browser has accepted the whole write. Strict durability asks
 * the browser to flush to disk before reporting completion.
 */
function runTransaction<T>(
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
function resultOf(event: Event): unknown {
  return (event.target as IDBRequest).result;
}
