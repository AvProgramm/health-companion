import { assertProfileSnapshot, type ProfileSnapshot } from '../domain/profile/profile';
import { resultOf, runTransaction } from './connection';

/** Return the last confirmed profile, or null when none has been saved. */
export function readProfile(db: IDBDatabase): Promise<ProfileSnapshot | null> {
  return runTransaction(db, ['profile'], (tx, finish, fail) => {
    tx.objectStore('profile').openCursor(null, 'prev').onsuccess = event => {
      const cursor = resultOf(event) as IDBCursorWithValue | null;
      // Reject corrupt persisted facts rather than silently reverting to an unrestricted profile.
      const latest = cursor === null ? null : cursor.value as ProfileSnapshot;
      try {
        if (latest !== null) assertProfileSnapshot(latest);
        finish(latest);
      } catch (problem) { fail(problem); }
    };
  }, 'readonly');
}

/** Return every saved profile version, oldest first, so history such as weight can be read. */
export function listProfileVersions(db: IDBDatabase): Promise<ProfileSnapshot[]> {
  return runTransaction(db, ['profile'], (tx, finish) => {
    tx.objectStore('profile').getAll().onsuccess = event => finish(resultOf(event) as ProfileSnapshot[]);
  }, 'readonly');
}

/** Append one confirmed profile version with retry and stale-screen protection. */
export function saveProfile(db: IDBDatabase, entry: ProfileSnapshot, expectedVersion: number) {
  assertProfileSnapshot(entry);
  // Ignore an invalid expected version because it cannot describe a saved screen.
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error('Reload your saved profile before changing it.');
  type Result = { status: 'saved'; entry: ProfileSnapshot; replayed: boolean } | { status: 'conflict'; latest: ProfileSnapshot | null };
  return runTransaction<Result>(db, ['profile'], (tx, finish, fail) => {
    const store = tx.objectStore('profile');
    // Recognise a retry before testing the expected version; reject reuse for a different action.
    store.index('byOperationKey').get(entry.operationKey).onsuccess = event => {
      const replay = resultOf(event) as ProfileSnapshot | undefined;
      if (replay !== undefined) {
        if (replay.version !== entry.version || JSON.stringify(replay.value) !== JSON.stringify(entry.value)) {
          fail(new Error('This confirmation key belongs to a different profile change.'));
          return;
        }
        finish({ status: 'saved', entry: replay, replayed: true });
        return;
      }
      // Read and append within the same transaction so simultaneous screens cannot overwrite history.
      store.openCursor(null, 'prev').onsuccess = latestEvent => {
        const cursor = resultOf(latestEvent) as IDBCursorWithValue | null;
        const latest = cursor === null ? null : cursor.value as ProfileSnapshot;
        // Ignore a corrupt previous snapshot because appending could conceal invalid restrictions.
        try { if (latest !== null) assertProfileSnapshot(latest); } catch (problem) { fail(problem); return; }
        if ((latest?.version ?? 0) !== expectedVersion) {
          finish({ status: 'conflict', latest });
          return;
        }
        if (entry.version !== expectedVersion + 1) {
          fail(new Error('Reload the saved profile before choosing its next version.'));
          return;
        }
        store.add(entry);
        finish({ status: 'saved', entry, replayed: false });
      };
    };
  });
}
