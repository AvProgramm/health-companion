/**
 * Moving the whole diary in and out: export, restore and erase.
 *
 * Restoring replaces this device's diary in one transaction, and only accepts a
 * file that validateBackup has already checked, so a damaged or foreign file can
 * never leave the diary half-restored.
 */
import { DB_VERSION, STORE_NAMES, resultOf, runTransaction } from '../connection';
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, countBackup, type BackupCheck, type BackupCounts, type DiaryBackup } from './format';

/**
 * Return every record on this device as one backup object, read in a single snapshot.
 */
export function exportDiary(db: IDBDatabase, now: Date = new Date()): Promise<DiaryBackup> {
  return runTransaction(db, STORE_NAMES, (tx, finish) => {
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
 * Replace everything on this device with a validated backup, in one transaction.
 *
 * Only accepts the result of validateBackup, so an unchecked file cannot reach here.
 */
export function restoreDiary(db: IDBDatabase, checked: Extract<BackupCheck, { ok: true }>): Promise<BackupCounts> {
  const { backup } = checked;
  return runTransaction(db, STORE_NAMES, (tx, finish) => {
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
 * Permanently remove every record from this device.
 */
export function wipeDiary(db: IDBDatabase): Promise<void> {
  return runTransaction<void>(db, STORE_NAMES, (tx, finish) => {
    for (const name of STORE_NAMES) {
      tx.objectStore(name).clear();
    }
    finish(undefined);
  });
}
