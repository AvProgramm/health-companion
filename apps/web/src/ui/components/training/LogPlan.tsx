import { useRef } from 'react';
import { saveLogEntry } from '../../../data/storage/logsRepo';
import { deviceZone, localDateIn } from '../../../domain/shared/dates';
import { sessionDrafts, type PlannedSession } from '../../../domain/training/planLog';
import { buildWorkout } from '../../../domain/training/workouts';
import { useSave } from '../../hooks/useSave';
import { NoticeLine } from '../shared/NoticeLine';

interface LogPlanProps {
  db: IDBDatabase;
  session: PlannedSession;
  onSaved: () => void;
}

/**
 * Save a planned session to today's diary once the person says they did it.
 *
 * Each exercise is saved as an ordinary timed workout, so history, backups and deleting
 * work the same as for a session typed on Today. The plan stays a suggestion until this
 * button is pressed.
 */
export function LogPlan({ db, session, onSaved }: LogPlanProps) {
  const { busy, notice, run } = useSave();
  // One ID per exercise for this plan, so a retry after an error is recognised as the same entries
  const entryIds = useRef<string[]>([]);

  /** Check every exercise, then save each one under today's date. */
  async function handleLog() {
    const zone = deviceZone();
    const now = new Date();
    const drafts = sessionDrafts(session);
    const saved = await run(async (operationKey) => {
      // Build every entry first, so one invalid exercise stops the save before anything is written
      const entries = drafts.map((draft, index) => {
        entryIds.current[index] ??= crypto.randomUUID();
        return buildWorkout(draft, { id: entryIds.current[index]!, operationKey: `${operationKey}:${index}`, localDate: localDateIn(zone, now), zone, savedAt: now.toISOString() });
      });
      for (const entry of entries) {
        await saveLogEntry(db, 'workouts', entry);
      }
      return { kind: 'saved', text: `Saved ${entries.length} ${entries.length === 1 ? 'exercise' : 'exercises'} to today.` };
    });

    // Start fresh IDs, so logging the same plan again is a second session and not a replay
    if (saved) {
      entryIds.current = [];
      onSaved();
    }
  }

  return (
    <div className="stack">
      <button type="button" className="button" disabled={busy} onClick={() => void handleLog()}>{busy ? 'Saving…' : 'I did this session: log it to today'}</button>
      <p className="hint">Logs each exercise with its planned minutes. Edit or delete any of them on Today.</p>
      <NoticeLine notice={notice} />
    </div>
  );
}
