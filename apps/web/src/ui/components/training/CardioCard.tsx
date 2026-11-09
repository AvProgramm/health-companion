import { useRef, useState, type FormEvent } from 'react';
import { Sneaker } from '@phosphor-icons/react';
import { localDateIn, deviceZone } from '../../../domain/shared/dates';
import { cardioBurn } from '../../../domain/training/cardio';
import { buildWorkout, type WorkoutDraft } from '../../../domain/training/workouts';
import { saveLogEntry } from '../../../storage/logsRepo';
import { burnText, readAmount } from '../../format';
import { OptionGroup } from '../shared/OptionGroup';
import { useSave } from '../../hooks/useSave';
import { NoticeLine } from '../shared/NoticeLine';

// The activities offered; a calorie estimate exists only for the first three
const ACTIVITIES = ['Run', 'Walk', 'Treadmill', 'Cycle', 'Swim', 'Row'] as const;
type Activity = (typeof ACTIVITIES)[number];
const ACTIVITY_OPTIONS = ACTIVITIES.map((activity): [Activity, string] => [activity, activity]);
// Seconds in a minute, because the stored duration is in minutes
const SECONDS_PER_MINUTE = 60;

interface CardioCardProps {
  db: IDBDatabase;
  weightKg: number | null;
  hideNumbers: boolean;
  onSaved: () => void;
}

/** Return the draft for what is on the form. */
function draftOf(activity: Activity, minutes: number | null, seconds: number | null, distanceKm: number | null): WorkoutDraft {
  const total = minutes === null && seconds === null ? null : (minutes ?? 0) + (seconds ?? 0) / SECONDS_PER_MINUTE;
  return { movement: activity, status: 'done', sets: [{ reps: null, load: null, loadUnit: null, perHand: false, minutes: total, distanceKm }] };
}

/**
 * Log a run, walk or other cardio, and show the estimated energy used.
 *
 * It saves as an ordinary timed workout, so history, backups and deleting all work
 * the same. Nothing is saved until the button is pressed.
 */
export function CardioCard({ db, weightKg, hideNumbers, onSaved }: CardioCardProps) {
  const [activity, setActivity] = useState<Activity>('Treadmill');
  const [minutes, setMinutes] = useState('');
  const [seconds, setSeconds] = useState('');
  const [distance, setDistance] = useState('');
  const { busy, notice, run } = useSave();
  // One ID per form, replaced after each save, so a retry is recognised as the same entry
  const entryId = useRef(crypto.randomUUID());

  const draft = draftOf(activity, readAmount(minutes), readAmount(seconds), readAmount(distance));
  const burn = cardioBurn(draft, weightKg);

  /** Check and save the session under today's date. */
  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const zone = deviceZone();
    const now = new Date();
    const saved = await run(async (operationKey) => {
      const entry = buildWorkout(draft, { id: entryId.current, operationKey, localDate: localDateIn(zone, now), zone, savedAt: now.toISOString() });
      const result = await saveLogEntry(db, 'workouts', entry);
      return { kind: 'saved', text: result.status === 'saved' && result.replayed ? 'Already saved.' : `Saved ${entry.movement} to today.` };
    });

    // Clear the form for the next session
    if (saved) {
      entryId.current = crypto.randomUUID();
      setMinutes('');
      setSeconds('');
      setDistance('');
      onSaved();
    }
  }

  return (
    <section className="card ai-card" aria-labelledby="cardio-heading">
      <div className="card-head"><div><p className="eyebrow">CARDIO</p><h2 id="cardio-heading" className="heading">Log a run or walk</h2></div><span className="badge"><Sneaker size={14} />Calories estimated</span></div>
      <form className="form" onSubmit={handleSubmit}>
        <OptionGroup legend="What you did" name="cardio-activity" options={ACTIVITY_OPTIONS} value={activity} onChange={setActivity} />
        <div className="row">
          <input id="cardio-minutes" className="input input-short" inputMode="numeric" aria-label="Minutes" value={minutes} onChange={event => setMinutes(event.target.value)} /><span>min</span>
          <input id="cardio-seconds" className="input input-short" inputMode="numeric" aria-label="Seconds" value={seconds} onChange={event => setSeconds(event.target.value)} /><span>sec</span>
          <input id="cardio-distance" className="input input-short" inputMode="decimal" aria-label="Distance in km" value={distance} onChange={event => setDistance(event.target.value)} /><span>km</span>
        </div>
        {burn !== null && <p className="body numbers" aria-live="polite">{hideNumbers ? 'Calorie estimate hidden' : burnText(burn)}</p>}
        {burn === null && <p className="hint">{weightKg === null ? 'Add your weight in Me to see an estimate.' : 'A calorie estimate needs time and distance for a run, walk or treadmill.'}</p>}
        <button type="submit" className="button" disabled={busy}>{busy ? 'Saving…' : 'Save session'}</button>
        <p className="hint">Machines often assume a default body, so this uses your own weight. It is an estimate, shown as a range.</p>
        <NoticeLine notice={notice} />
      </form>
    </section>
  );
}
