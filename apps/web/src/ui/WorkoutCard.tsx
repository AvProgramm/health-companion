import { cardioBurn } from '../domain/training/cardio';
import { describeSets, type WorkoutEntry } from '../domain/training/workouts';
import { DeleteToggle } from './DeleteToggle';
import { burnText, formatTime } from './format';

interface WorkoutCardProps {
  db: IDBDatabase;
  entry: WorkoutEntry;
  weightKg: number | null;
  hideNumbers: boolean;
  onChanged: () => Promise<void>;
}

/**
 * One saved training session in the day's timeline.
 */
export function WorkoutCard({ db, entry, weightKg, hideNumbers, onChanged }: WorkoutCardProps) {
  const deleted = entry.deleted === true;
  const burn = cardioBurn(entry, weightKg);
  return (
    <article className={`card ${deleted ? 'card-muted' : ''}`}>
      <div className="card-head">
        <h3 className="heading">
          {entry.status === 'skipped' ? 'Rest day' : entry.movement} · {formatTime(entry.savedAt)}
          {deleted && ' · deleted'}
        </h3>
        <DeleteToggle db={db} store="workouts" entry={entry} onChanged={onChanged} label={entry.movement} />
      </div>
      {!deleted && entry.status === 'done' && <p className="body numbers">{describeSets(entry)}</p>}
      {!deleted && burn !== null && !hideNumbers && <p className="hint numbers">{burnText(burn)}</p>}
    </article>
  );
}
