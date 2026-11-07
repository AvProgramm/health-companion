import { useEffect, useState } from 'react';
import { describeSets, lastPerformed, type WorkoutEntry } from '../domain/training/workouts';
import { listWorkouts } from '../storage/logsRepo';
import { formatDiaryDate } from './format';
import { PlanSession } from './PlanSession';
import { errorText } from './useSave';

// Enough history to see a trend on a phone screen without scrolling forever
const HISTORY_LENGTH = 20;

/**
 * The Gym tab: the last session of each movement, then recent history.
 */
export function GymView({ db }: { db: IDBDatabase }) {
  const [entries, setEntries] = useState<WorkoutEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listWorkouts(db).then(setEntries, (problem: unknown) => setError(errorText(problem)));
  }, [db]);

  // Newest first, leaving out deleted entries
  const live = (entries ?? [])
    .filter((entry) => entry.deleted !== true)
    .sort((a, b) => (a.localDate === b.localDate ? b.savedAt.localeCompare(a.savedAt) : b.localDate.localeCompare(a.localDate)));

  // The latest performed session of each movement
  const movementKeys = [...new Set(live.filter((entry) => entry.status === 'done').map((entry) => entry.movementKey))];
  const lastSessions = movementKeys.map((key) => lastPerformed(live, key)).filter((entry): entry is WorkoutEntry => entry !== undefined);

  return (
    <>
      <header className="masthead">
        <h1 className="title">Gym</h1>
        <p className="status">Log training on Today, e.g. "row 3x8 at 5kg each hand" or "ran 5 km in 30 min".</p>
      </header>

      <PlanSession />

      {error !== null && <p className="notice notice-error" role="alert">{error}</p>}

      {entries !== null && live.length === 0 && (
        <section className="card card-muted">
          <p className="body">No training logged yet.</p>
          <p className="hint">Your last sets for each exercise will show here, so you know where to start next time.</p>
        </section>
      )}

      {lastSessions.length > 0 && (
        <section className="card" aria-labelledby="last-heading">
          <h2 id="last-heading" className="heading">Last time</h2>
          <ul className="items">
            {lastSessions.map((entry) => (
              <li key={entry.movementKey} className="item">
                <div className="item-main">
                  <span>{entry.movement}</span>
                  <span className="hint">{formatDiaryDate(entry.localDate)}</span>
                </div>
                <span className="numbers">{describeSets(entry)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {live.length > 0 && (
        <section className="card" aria-labelledby="history-heading">
          <h2 id="history-heading" className="heading">History</h2>
          <ol className="history">
            {live.slice(0, HISTORY_LENGTH).map((entry) => (
              <li key={entry.id}>
                <span className="history-main">{entry.status === 'skipped' ? 'Rest day' : `${entry.movement}: ${describeSets(entry)}`}</span>
                <span className="history-meta">{formatDiaryDate(entry.localDate)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
