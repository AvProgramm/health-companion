import { describeSets, type WorkoutEntry } from '../domain/training/workouts';
import { DeleteToggle } from './DeleteToggle';
import { formatTime } from './format';

interface WorkoutCardProps {
  db: IDBDatabase;
  entry: WorkoutEntry;
  onChanged: () => Promise<void>;
}

/**
 * One saved training session in the day's timeline.
 */
export function WorkoutCard({ db, entry, onChanged }: WorkoutCardProps) {
  const deleted = entry.deleted === true;
  return (
    <article className={`card ${deleted ? 'card-muted' : ''}`}>
      <div className="card-head">
        <h3 className="heading">
          {entry.status === 'skipped' ? 'Rest day' : entry.movement} · {formatTime(entry.savedAt)}
          {deleted && ' · deleted'}
        </h3>
        <DeleteToggle db={db} store="workouts" entry={entry} onChanged={onChanged} />
      </div>
      {!deleted && entry.status === 'done' && <p className="body numbers">{describeSets(entry)}</p>}
    </article>
  );
}
