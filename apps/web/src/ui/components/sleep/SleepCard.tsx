import { formatDuration, type SleepEntry } from '../../../domain/sleep/sleep';
import { DeleteToggle } from '../shared/DeleteToggle';

interface SleepCardProps {
  db: IDBDatabase;
  entry: SleepEntry;
  onChanged: () => Promise<void>;
}

/**
 * The night's sleep in the day's timeline: time in bed, and time asleep only if reported.
 */
export function SleepCard({ db, entry, onChanged }: SleepCardProps) {
  const deleted = entry.deleted === true;
  return (
    <article className={`card ${deleted ? 'card-muted' : ''}`}>
      <div className="card-head">
        <h3 className="heading">
          Sleep · {entry.bedTime} → {entry.wakeTime}
          {deleted && ' · deleted'}
        </h3>
        <DeleteToggle db={db} store="sleep" entry={entry} onChanged={onChanged} label="sleep" />
      </div>
      {!deleted && (
        <p className="body numbers">
          {formatDuration(entry.timeInBedMin)} in bed
          {entry.asleepMin === null ? ' · time asleep not reported' : ` · ${formatDuration(entry.asleepMin)} asleep`}
        </p>
      )}
    </article>
  );
}
