import { useState, type FormEvent } from 'react';
import { BODY_AREAS, type BodyArea } from '../../../domain/profile/profile';
import type { Capability, Category, Equipment, MovementCard } from '../../../domain/training/catalogue';
import { ownExerciseCard } from '../../../domain/training/customCards';
import { Choices } from '../shared/Choices';
import { CAPABILITY_LABELS, EQUIPMENT_LABELS } from '../../format';
import { OptionGroup } from '../shared/OptionGroup';
import { CATEGORY_CHOICES } from './PlanResultView';
import { Sheet } from '../shared/Sheet';

// The same planning default the library uses, and the person can change it
const DEFAULT_MINUTES = '5';
// Every piece of equipment the planner can check
const EQUIPMENT_CHOICES = Object.entries(EQUIPMENT_LABELS) as [Equipment, string][];
// The abilities the planner can filter on
const NEED_CHOICES = Object.entries(CAPABILITY_LABELS) as [Capability, string][];
// The body areas a saved adaptation can avoid, as they read on a checkbox
const AREA_CHOICES = BODY_AREAS.map((area): [BodyArea, string] => [area, area[0]!.toUpperCase() + area.slice(1)]);

interface OwnExerciseSheetProps { initialName: string; onConfirm: (card: MovementCard) => Promise<void>; onClose: () => void }

/**
 * Describe an exercise the library does not have, and add it after an explicit confirmation.
 *
 * Nothing is saved until the person presses Add. Facts left blank stay unknown, so an
 * active adaptation leaves the exercise out rather than assuming it is suitable.
 */
export function OwnExerciseSheet({ initialName, onConfirm, onClose }: OwnExerciseSheetProps) {
  // Keep one ID for this draft, so a retried save cannot create a second exercise
  const [id] = useState(() => crypto.randomUUID());
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState<Category>('push');
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [cue, setCue] = useState('');
  const [requires, setRequires] = useState<Capability[]>([]);
  const [seated, setSeated] = useState(false);
  const [loads, setLoads] = useState<BodyArea[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Build the card from the form, and save it. */
  async function confirm(event: FormEvent) {
    event.preventDefault();

    // Ignore a repeated confirmation because one write is already in flight
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await onConfirm(ownExerciseCard({ name, category, equipment, minutes: Number(minutes), cue, requires, seated, loads }, id));
      onClose();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally { setBusy(false); }
  }

  return <Sheet title="Add my own exercise" onClose={onClose}>
    <form className="form" onSubmit={confirm}>
      <label className="field"><span className="label">Exercise name</span><input id="own-name" className="input" maxLength={80} value={name} onChange={event => setName(event.target.value)} autoComplete="off" /></label>
      <OptionGroup legend="What it trains" name="own-category" options={CATEGORY_CHOICES} value={category} onChange={setCategory} />
      <Choices legend="Equipment it needs (none ticked means bodyweight)" choices={EQUIPMENT_CHOICES} selected={equipment} onChange={setEquipment} />
      <label className="field"><span className="label">Planning block (minutes)</span><input id="own-minutes" className="input input-short" type="number" min="1" max="60" step="1" value={minutes} onChange={event => setMinutes(event.target.value)} /></label>
      <label className="field"><span className="label">How to do it (optional)</span><textarea id="own-cue" className="input ai-input" maxLength={500} rows={2} value={cue} onChange={event => setCue(event.target.value)} /></label>
      <details className="exercise-instructions"><summary>If you have saved adaptations</summary>
        <p className="hint">Leave these blank if unsure. With an adaptation active, an exercise with unknown facts is left out of plans.</p>
        <Choices legend="Needs" choices={NEED_CHOICES} selected={requires} onChange={setRequires} />
        <label className="choice"><input id="own-seated" type="checkbox" checked={seated} onChange={event => setSeated(event.target.checked)} />Done fully seated</label>
        <Choices legend="Body areas it loads" choices={AREA_CHOICES} selected={loads} onChange={setLoads} />
      </details>
      <p className="hint">Stays on this device. Your own exercise has not been reviewed by anyone else.</p>
      {error && <p role="alert" className="field-error">{error}</p>}
      <button className="button" type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add to my exercises'}</button>
    </form>
  </Sheet>;
}
