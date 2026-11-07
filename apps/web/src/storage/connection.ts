/**
 * Opening the diary database, upgrading its schema, and running transactions.
 *
 * The repositories (foods, meals, logs) and backup all write through runTransaction,
 * so every write commits as a whole or not at all.
 */

// Bump only together with a new step in upgradeSchema
const DB_NAME = 'health-companion';
export const DB_VERSION = 3;

// Every store, in the order a backup lists them
export const STORE_NAMES = ['foods', 'meals', 'revisions', 'operations', 'workouts', 'sleep'] as const;
export type StoreName = (typeof STORE_NAMES)[number];

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
 * A phone on an older version runs only the steps it is missing, so its saved
 * records are kept. Never edit an earlier step; add a new one.
 */
function upgradeSchema(db: IDBDatabase, tx: IDBTransaction, oldVersion: number): void {
  // Version 1: foods, meals, revisions and used operation keys
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

  // Version 3: training and sleep logs, found by date (and workouts by movement for "last time")
  if (oldVersion < 3) {
    const workouts = db.createObjectStore('workouts', { keyPath: 'id' });
    workouts.createIndex('byDate', 'localDate');
    workouts.createIndex('byMovement', 'movementKey');
    db.createObjectStore('sleep', { keyPath: 'id' }).createIndex('byDate', 'localDate');
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
  storeNames: readonly StoreName[],
  body: (tx: IDBTransaction, finish: (value: T) => void, fail: (error: unknown) => void) => void,
  mode: IDBTransactionMode = 'readwrite',
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction([...storeNames], mode, { durability: 'strict' });
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
