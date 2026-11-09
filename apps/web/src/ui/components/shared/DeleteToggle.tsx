import { setLogDeleted, type LogEntry, type LogStore } from '../../../storage/logsRepo';
import { NoticeLine } from './NoticeLine';
import { useSave } from '../../hooks/useSave';

interface DeleteToggleProps {
  db: IDBDatabase;
  store: LogStore;
  entry: LogEntry;
  onChanged: () => Promise<void>;
  // What the entry is called, so screen readers can tell several Delete buttons apart
  label: string;
}

/**
 * Delete or restore a workout or sleep entry, based on the version on screen.
 */
export function DeleteToggle({ db, store, entry, onChanged, label }: DeleteToggleProps) {
  const { busy, notice, run } = useSave();
  const deleted = entry.deleted === true;

  /**
   * Flip the delete flag and reload the day.
   */
  async function toggle() {
    await run(async (operationKey) => {
      const result = await setLogDeleted(db, store, { id: entry.id, expectedVersion: entry.version, deleted: !deleted, operationKey, savedAt: new Date().toISOString() });
      await onChanged();
      return result.status === 'conflict'
        ? { kind: 'conflict', text: 'This changed in another tab. The latest version is now shown.' }
        : { kind: 'saved', text: deleted ? 'Restored.' : 'Deleted. You can restore it.' };
    });
  }

  return (
    <>
      <button type="button" className="button button-quiet" aria-label={`${deleted ? 'Restore' : 'Delete'} ${label}`} disabled={busy} onClick={toggle}>
        {deleted ? 'Restore' : 'Delete'}
      </button>
      {notice?.kind !== 'saved' && <NoticeLine notice={notice} />}
    </>
  );
}
