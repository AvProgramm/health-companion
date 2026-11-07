/**
 * Workout and sleep logs.
 *
 * Unlike meals, a log entry has no revisions: it is saved once, and the only later
 * change is a delete flag that can be undone. Both are versioned, so a stale
 * screen gets a conflict instead of overwriting a newer change.
 */
import type { SleepEntry } from '../domain/sleep/sleep';
import type { WorkoutEntry } from '../domain/training/workouts';
import { resultOf, runTransaction } from './connection';

export type LogStore = 'workouts' | 'sleep';
export type LogEntry = WorkoutEntry | SleepEntry;
export type LogResult<T extends LogEntry> =
  | { status: 'saved'; entry: T; replayed: boolean }
  | { status: 'conflict'; latest: T };

/**
 * Save a new workout or sleep entry.
 *
 * Replaying the same operation key returns the stored entry, so a double tap saves once.
 * The same ID with a different key is a programming error and saves nothing.
 */
export function saveLogEntry<T extends LogEntry>(db: IDBDatabase, store: LogStore, entry: T): Promise<LogResult<T>> {
  return runTransaction(db, [store], (tx, finish, fail) => {
    const logs = tx.objectStore(store);
    logs.get(entry.id).onsuccess = (event) => {
      const existing = resultOf(event) as T | undefined;

      // Replay a save that already happened
      if (existing !== undefined && existing.operationKey === entry.operationKey) {
        finish({ status: 'saved', entry: existing, replayed: true });
        return;
      }
      if (existing !== undefined) {
        fail(new Error(`Entry ${entry.id} already exists`));
        return;
      }

      logs.add(entry);
      finish({ status: 'saved', entry, replayed: false });
    };
  });
}

/**
 * Delete or restore a workout or sleep entry, based on the version the screen showed.
 */
export function setLogDeleted<T extends LogEntry>(
  db: IDBDatabase,
  store: LogStore,
  change: { id: string; expectedVersion: number; deleted: boolean; operationKey: string; savedAt: string },
): Promise<LogResult<T>> {
  return runTransaction(db, [store], (tx, finish, fail) => {
    const logs = tx.objectStore(store);
    logs.get(change.id).onsuccess = (event) => {
      const existing = resultOf(event) as T | undefined;
      if (existing === undefined) {
        fail(new Error(`Entry ${change.id} is not saved on this device`));
        return;
      }

      // Replay a change that already happened, then refuse a stale one
      if (existing.operationKey === change.operationKey) {
        finish({ status: 'saved', entry: existing, replayed: true });
        return;
      }
      if (existing.version !== change.expectedVersion) {
        finish({ status: 'conflict', latest: existing });
        return;
      }

      const next = { ...existing, deleted: change.deleted, version: existing.version + 1, operationKey: change.operationKey, savedAt: change.savedAt };
      logs.put(next);
      finish({ status: 'saved', entry: next, replayed: false });
    };
  });
}

/**
 * Return the workout or sleep entries saved under one diary date, oldest first.
 */
export function logsOn<T extends LogEntry>(db: IDBDatabase, store: LogStore, localDate: string): Promise<T[]> {
  return runTransaction(db, [store], (tx, finish) => {
    tx.objectStore(store).index('byDate').getAll(localDate).onsuccess = (event) =>
      finish((resultOf(event) as T[]).sort((a, b) => a.savedAt.localeCompare(b.savedAt)));
  }, 'readonly');
}

/**
 * Return every workout entry, for the Gym tab's history and "last time".
 */
export function listWorkouts(db: IDBDatabase): Promise<WorkoutEntry[]> {
  return runTransaction(db, ['workouts'], (tx, finish) => {
    tx.objectStore('workouts').getAll().onsuccess = (event) => finish(resultOf(event) as WorkoutEntry[]);
  }, 'readonly');
}
