import { assertCustomCard, latestCustomCards, MAX_CUSTOM_CARDS, type CustomCardSelection } from '../../domain/training/customCards';
import { resultOf, runTransaction } from './connection';

/** Describe a confirmed write or a stale selection conflict. */
type SelectionResult = { status: 'saved'; entry: CustomCardSelection; replayed: boolean } | { status: 'conflict'; latest: CustomCardSelection | null };

/** Append one confirmed snapshot with operation replay and expected-version checks. */
export async function saveCustomCard(db: IDBDatabase, entry: CustomCardSelection, expectedVersion: number): Promise<SelectionResult> {
  assertCustomCard(entry);
  return runTransaction(db, ['customCards'], (tx, finish, fail) => {
    const store = tx.objectStore('customCards');
    store.index('byOperationKey').get(entry.operationKey).onsuccess = event => {
      const replay = resultOf(event) as CustomCardSelection | undefined;
      if (replay !== undefined) {
        if (replay.id !== entry.id) { fail(new Error('This operation key belongs to another exercise.')); return; }
        finish({ status: 'saved', entry: replay, replayed: true });
        return;
      }
      // Read and write inside the same transaction so two tabs cannot exceed the pool limit.
      store.getAll().onsuccess = read => {
        const latest = latestCustomCards(resultOf(read) as CustomCardSelection[]);
        const previous = latest.find(item => item.id === entry.id);
        if ((previous?.version ?? 0) !== expectedVersion) {
          finish({ status: 'conflict', latest: previous ?? null });
          return;
        }
        if (entry.version !== expectedVersion + 1 || (previous === undefined && entry.deleted)) {
          fail(new Error('Reload the exercise choices before changing this version.'));
          return;
        }
        if (!entry.deleted && (previous === undefined || previous.deleted) && latest.filter(item => !item.deleted).length >= MAX_CUSTOM_CARDS) {
          fail(new Error(`Keep at most ${MAX_CUSTOM_CARDS} added exercises. Remove one before adding another.`));
          return;
        }
        store.add(entry);
        finish({ status: 'saved', entry, replayed: false });
      };
    };
  });
}

/** Return each choice's newest snapshot without discarding its stored history. */
export function listCustomCards(db: IDBDatabase): Promise<CustomCardSelection[]> {
  return runTransaction(db, ['customCards'], (tx, finish) => {
    tx.objectStore('customCards').getAll().onsuccess = event => finish(latestCustomCards(resultOf(event) as CustomCardSelection[]));
  }, 'readonly');
}
