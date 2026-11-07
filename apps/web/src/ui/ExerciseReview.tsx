import { useState, type FormEvent } from 'react';
import type { Capability, Category, Equipment, MovementCard } from '../domain/training/catalogue';
import { EXERCISE_CAPABILITIES, EXERCISE_CATEGORIES, EXERCISE_EQUIPMENT } from '../domain/training/customCards';
import { reviewExercise, type ExerciseEntry } from '../domain/training/exerciseSearch';
import { MuscleMap } from './MuscleMap';
import { Sheet } from './Sheet';

interface ExerciseReviewProps { entry: ExerciseEntry; onConfirm: (card: MovementCard) => Promise<void>; onClose: () => void }

/** Review unknown requirements and a planning block before saving a chosen exercise. */
export function ExerciseReview({ entry, onConfirm, onClose }: ExerciseReviewProps) {
  const [category, setCategory] = useState<Category | ''>(entry.category ?? '');
  const [equipment, setEquipment] = useState<Equipment[]>([...(entry.equipment ?? [])]);
  const [requires, setRequires] = useState<Capability[]>([]);
  const [minutes, setMinutes] = useState(String(entry.minutes));
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Save only after the person has checked the source's missing requirements. */
  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (!reviewed || busy) return;
    setError(null);
    setBusy(true);
    try {
      const card = reviewExercise(entry, { category: category || null, equipment: reviewed ? equipment : null, requires: reviewed ? requires : null, minutes: Number(minutes) });
      await onConfirm(card);
      onClose();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally { setBusy(false); }
  }

  return <Sheet title="Review exercise" onClose={onClose}>
    <div className="exercise-review-head"><MuscleMap category={entry.category} muscles={entry.primaryMuscles} /><div><span className="eyebrow">YOUR CHOICE, NOT SAVED</span><h3 className="title">{entry.name}</h3><p className="hint">Source equipment: {entry.sourceEquipment ?? 'unknown'}. Imported exercise data is not a medical assessment.</p></div></div>
    <form className="form" onSubmit={confirm}>
      <div className="grid-2"><label className="field"><span className="label">Category</span><select className="input" value={category} onChange={event => setCategory(event.target.value as Category | '')}><option value="">Review category</option>{EXERCISE_CATEGORIES.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="field"><span className="label">Planning block (minutes)</span><input className="input" type="number" min="1" max="60" step="1" value={minutes} onChange={event => setMinutes(event.target.value)} /></label></div>
      <p className="hint">The five minute default is an editable planning block, not a measured exercise duration or a prescription.</p>
      <fieldset className="fieldset"><legend className="label">Equipment actually needed</legend><div className="row">{EXERCISE_EQUIPMENT.map(value => <label className="choice" key={value}><input type="checkbox" checked={equipment.includes(value)} onChange={event => setEquipment(event.target.checked ? [...equipment, value] : equipment.filter(item => item !== value))} />{value.replaceAll('_', ' ')}</label>)}</div><p className="hint">Leave these unchecked only when no listed equipment is needed.</p></fieldset>
      <fieldset className="fieldset"><legend className="label">Capabilities required</legend><div className="row">{EXERCISE_CAPABILITIES.map(value => <label className="choice" key={value}><input type="checkbox" checked={requires.includes(value)} onChange={event => setRequires(event.target.checked ? [...requires, value] : requires.filter(item => item !== value))} />{value.replaceAll('_', ' ')}</label>)}</div><p className="hint">The source does not encode these requirements. Check any that apply before confirming.</p></fieldset>
      <details className="exercise-instructions"><summary>Read the source instructions</summary><p className="body">{entry.cue || 'The source supplied no instructions.'}</p></details>
      <label className="choice review-ack"><input name="requirementsReviewed" type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />I checked the equipment and capability requirements.</label>
      {error && <p role="alert" className="field-error">{error}</p>}
      <button className="button" type="submit" disabled={!reviewed || busy || category === '' || entry.equipment === null}>{busy ? 'Adding…' : 'Add to my exercises'}</button>
    </form>
  </Sheet>;
}
