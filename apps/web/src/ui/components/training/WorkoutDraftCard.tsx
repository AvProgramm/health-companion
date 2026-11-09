import { useEffect, useRef, useState } from 'react';
import { buildWorkout, describeSets, lastPerformed, movementKey, type LoadUnit, type WorkoutDraft, type WorkoutEntry, type WorkoutSet } from '../../../domain/training/workouts';
import { listWorkouts, saveLogEntry } from '../../../storage/logsRepo';
import { formatDiaryDate, readAmount } from '../../format';
import { NoticeLine } from '../shared/NoticeLine';
import { useSave } from '../../hooks/useSave';

interface WorkoutDraftCardProps {
  db: IDBDatabase;
  date: string;
  dateLabel: string;
  zone: string;
  draft: WorkoutDraft;
  onSaved: (text: string) => void;
  onCancel: () => void;
}

/**
 * The "Review training, not saved yet" card: check the sets, see last time, save once.
 */
export function WorkoutDraftCard({ db, date, dateLabel, zone, draft, onSaved, onCancel }: WorkoutDraftCardProps) {
  const first = draft.sets[0];
  // Timed work (a run, badminton) shows minutes and distance instead of sets and reps
  const timed = first !== undefined && first.reps === null;
  const skipped = draft.status === 'skipped';

  const [movement, setMovement] = useState(draft.movement);
  const [setCount, setSetCount] = useState(String(Math.max(draft.sets.length, 1)));
  const [reps, setReps] = useState(first?.reps?.toString() ?? '');
  const [load, setLoad] = useState(first?.load?.toString() ?? '');
  const [loadUnit, setLoadUnit] = useState<LoadUnit>(first?.loadUnit ?? 'kg');
  const [perHand, setPerHand] = useState(first?.perHand ?? false);
  const [minutes, setMinutes] = useState(first?.minutes?.toString() ?? '');
  const [distance, setDistance] = useState(first?.distanceKm?.toString() ?? '');
  const [history, setHistory] = useState<WorkoutEntry[]>([]);
  const { busy, notice, run } = useSave();

  // One ID per draft, so a retried save is recognised as the same entry
  const entryId = useRef(crypto.randomUUID());

  // Load past sessions for "last time"
  useEffect(() => {
    listWorkouts(db).then(setHistory, () => setHistory([]));
  }, [db]);

  // The draft as the fields now describe it, checked by the same function that saves it
  const current = currentDraft();
  const checked = checkDraft(current);
  const previous = lastPerformed(history, movementKey(movement));

  /**
   * Return the draft built from the editable fields; every set is the same.
   */
  function currentDraft(): WorkoutDraft {
    if (skipped) {
      return { movement, status: 'skipped', sets: [] };
    }
    const set: WorkoutSet = timed
      ? { reps: null, load: null, loadUnit: null, perHand: false, minutes: readAmount(minutes), distanceKm: readAmount(distance) }
      : { reps: readAmount(reps), load: readAmount(load), loadUnit: load.trim() === '' ? null : loadUnit, perHand, minutes: null, distanceKm: null };
    const count = timed ? 1 : Number(setCount);
    return { movement, status: 'done', sets: Number.isInteger(count) && count > 0 ? Array.from({ length: count }, () => ({ ...set })) : [] };
  }

  /**
   * Return the reason the draft cannot be saved yet, or null if it can.
   */
  function checkDraft(candidate: WorkoutDraft): string | null {
    try {
      buildWorkout(candidate, { id: 'check', operationKey: 'check', localDate: date, zone, savedAt: new Date().toISOString() });
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }

  /**
   * Save the session under the shown date.
   */
  async function save() {
    const saved = await run(async (operationKey) => {
      const entry = buildWorkout(current, { id: entryId.current, operationKey, localDate: date, zone, savedAt: new Date().toISOString() });
      const result = await saveLogEntry(db, 'workouts', entry);
      return { kind: 'saved', text: result.status === 'saved' && result.replayed ? 'Already saved.' : `Saved ${entry.movement} to ${dateLabel}.` };
    });
    if (saved) {
      onSaved(`Saved ${movement} to ${dateLabel}.`);
    }
  }

  return (
    <section className="card card-draft" aria-labelledby="training-heading">
      <div className="card-head">
        <h2 id="training-heading" className="heading">{skipped ? 'Rest day' : 'Review training'}</h2>
        <span className="badge badge-warn">Not saved yet</span>
      </div>

      {skipped ? (
        <p className="body">No training on {dateLabel}. Saving it keeps the record honest; nothing is counted as missed.</p>
      ) : (
        <>
          <label className="field">
            <span className="label">Exercise or activity</span>
            <input className="input" value={movement} onChange={(event) => setMovement(event.target.value)} />
          </label>

          {timed ? (
            <div className="row">
              <input className="input input-short" inputMode="decimal" aria-label="Minutes" value={minutes} onChange={(event) => setMinutes(event.target.value)} />
              <span>min</span>
              <input className="input input-short" inputMode="decimal" aria-label="Distance in km" value={distance} onChange={(event) => setDistance(event.target.value)} />
              <span>km</span>
            </div>
          ) : (
            <>
              <div className="row">
                <input className="input input-short" inputMode="numeric" aria-label="Sets" value={setCount} onChange={(event) => setSetCount(event.target.value)} />
                <span>sets ×</span>
                <input className="input input-short" inputMode="numeric" aria-label="Reps per set" value={reps} onChange={(event) => setReps(event.target.value)} />
                <span>reps</span>
              </div>
              <div className="row">
                <input className="input input-short" inputMode="decimal" aria-label="Load" placeholder="none" value={load} onChange={(event) => setLoad(event.target.value)} />
                <select className="input" aria-label="Load unit" value={loadUnit} onChange={(event) => setLoadUnit(event.target.value as LoadUnit)}>
                  <option value="kg">kg</option>
                  <option value="lb">lb</option>
                </select>
                <label className="choice">
                  <input type="checkbox" checked={perHand} onChange={(event) => setPerHand(event.target.checked)} />
                  each hand
                </label>
              </div>
            </>
          )}

          {checked === null ? (
            <p className="body numbers">{describeSets(current)}</p>
          ) : (
            <p className="field-error">{checked}</p>
          )}
          {perHand && !timed && <p className="hint">The load is per hand. The diary never adds hands together.</p>}
        </>
      )}

      {previous !== undefined && !skipped && (
        <p className="hint numbers">Last time ({formatDiaryDate(previous.localDate)}): {describeSets(previous)}</p>
      )}

      <NoticeLine notice={notice} />

      <div className="actions">
        <button type="button" className="button" disabled={busy || checked !== null} onClick={save}>
          {busy ? 'Saving…' : skipped ? `Save rest day for ${dateLabel}` : `Save training to ${dateLabel}`}
        </button>
        <button type="button" className="button button-quiet" onClick={onCancel}>Discard</button>
      </div>
    </section>
  );
}
