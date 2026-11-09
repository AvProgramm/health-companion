import { useState, type FormEvent } from 'react';
import type { MovementCard } from '../../../domain/training/catalogue';
import { reviewExercise, whyNotAddable, type ExerciseEntry } from '../../../domain/training/exerciseSearch';
import { CAPABILITY_LABELS, EQUIPMENT_LABELS, LEVEL_LABELS, errorText } from '../../format';
import { MuscleMap } from './MuscleMap';
import { Sheet } from '../shared/Sheet';

interface ExerciseReviewProps { entry: ExerciseEntry; onConfirm: (card: MovementCard) => Promise<void>; onClose: () => void }

/**
 * Show what the source says about an exercise, and add it after an explicit confirmation.
 *
 * Area, equipment and needs are the source's facts and cannot be edited here; the
 * planning block is the only choice, because the source gives no duration.
 */
export function ExerciseReview({ entry, onConfirm, onClose }: ExerciseReviewProps) {
  // Keep the planning block in an unsaved draft until the person confirms
  const [minutes, setMinutes] = useState(String(entry.minutes));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocked = whyNotAddable(entry);

  /** Save the exercise with the source's facts and the chosen planning block. */
  async function confirm(event: FormEvent) {
    event.preventDefault();
    // Ignore a repeated confirmation because one write is already in flight
    if (busy || blocked !== null) return;
    setError(null);
    setBusy(true);
    try {
      await onConfirm(reviewExercise(entry, Number(minutes)));
      onClose();
    } catch (problem) {
      setError(errorText(problem));
    } finally { setBusy(false); }
  }

  // Describe each fact as it reads on screen; bodyweight and "no special ability" are facts too
  const equipmentText = entry.equipment === null ? 'Unknown' : entry.equipment.length === 0 ? 'None, bodyweight' : entry.equipment.map(item => EQUIPMENT_LABELS[item]).join(', ');
  const needsText = entry.requires.length === 0 ? 'Nothing beyond the equipment' : entry.requires.map(item => CAPABILITY_LABELS[item]).join(', ');

  return <Sheet title="Review exercise" onClose={onClose}>
    <div className="exercise-review-head"><MuscleMap category={entry.category} muscles={entry.primaryMuscles} /><div><span className="eyebrow">FROM THE EXERCISE LIBRARY</span><h3 className="title">{entry.name}</h3><p className="hint">Imported exercise data is not a medical assessment.</p></div></div>
    <dl className="exercise-facts">
      <div><dt>Area</dt><dd className="exercise-fact-area">{entry.category ?? 'Not mapped'}</dd></div>
      <div><dt>Equipment</dt><dd>{equipmentText}</dd></div>
      <div><dt>Needs</dt><dd>{needsText}</dd></div>
      <div><dt>Level</dt><dd>{entry.level === null ? 'Not given' : LEVEL_LABELS[entry.level]}</dd></div>
    </dl>
    <p className="hint">These come from the source{entry.sourceEquipment === null ? '' : ` (listed equipment: ${entry.sourceEquipment})`} and its instructions, so they cannot be changed here.</p>
    {blocked !== null ? <p className="notice" role="status">{blocked}</p> : <form className="form" onSubmit={confirm}>
      <label className="field"><span className="label">Planning block (minutes)</span><input className="input input-short" type="number" min="1" max="60" step="1" value={minutes} onChange={event => setMinutes(event.target.value)} /></label>
      <p className="hint">The source gives no duration. Five minutes is a planning default you can change, not a prescription.</p>
      <details className="exercise-instructions"><summary>Read the instructions</summary><p className="body">{entry.cue || 'The source supplied no instructions.'}</p></details>
      {error && <p role="alert" className="field-error">{error}</p>}
      <button className="button" type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add to my exercises'}</button>
    </form>}
  </Sheet>;
}
