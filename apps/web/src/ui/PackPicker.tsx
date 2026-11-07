import { useMemo, useState } from 'react';
import { CheckCircle, Lightning } from '@phosphor-icons/react';
import type { MovementCard } from '../domain/training/catalogue';
import { MAX_CUSTOM_CARDS, type CustomCardSelection } from '../domain/training/customCards';
import type { ExerciseEntry } from '../domain/training/exerciseSearch';
import { DIFFICULTIES, PACKS, SETTINGS, buildPack, type Difficulty, type Setting } from '../domain/training/packs';
import { ExerciseReview } from './ExerciseReview';
import { EQUIPMENT_LABELS, LEVEL_LABELS } from './format';
import { MuscleMap } from './MuscleMap';

interface PackPickerProps {
  entries: readonly ExerciseEntry[];
  chosen: readonly CustomCardSelection[];
  busy: boolean;
  onAdd: (card: MovementCard) => Promise<void>;
}

/**
 * Display a ready-made training day for the chosen difficulty and setting.
 *
 * The session is a suggestion built from reviewed library exercises; adding one to
 * the planner still goes through the review sheet and an explicit confirmation.
 */
export function PackPicker({ entries, chosen, busy, onAdd }: PackPickerProps) {
  // Start with a short full-body day that needs no equipment
  const [packId, setPackId] = useState('full_body');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [setting, setSetting] = useState<Setting>('bodyweight');
  const [reviewing, setReviewing] = useState<ExerciseEntry | null>(null);
  const session = useMemo(() => buildPack(packId, difficulty, setting, entries), [packId, difficulty, setting, entries]);
  const pack = PACKS.find(item => item.id === packId)!;

  // Show which exercises are already in the planner pool, and whether it has room
  const active = chosen.filter(choice => !choice.deleted);
  const added = new Set(active.map(choice => choice.id));

  return <section className="card pack-picker" aria-labelledby="pack-heading">
    <div className="card-head"><div><p className="eyebrow">QUICK START</p><h2 className="heading" id="pack-heading">Ready-made days</h2></div><span className="badge"><Lightning size={14} />No setup</span></div>
    <OptionGroup legend="Day" name="pack-day" options={PACKS.map(item => [item.id, item.name])} value={packId} onChange={setPackId} />
    <div className="pack-option-row">
      <OptionGroup legend="Difficulty" name="pack-difficulty" options={Object.entries(DIFFICULTIES).map(([value, rule]) => [value as Difficulty, rule.label])} value={difficulty} onChange={setDifficulty} />
      <OptionGroup legend="Where" name="pack-setting" options={Object.entries(SETTINGS).map(([value, place]) => [value as Setting, place.label])} value={setting} onChange={setSetting} />
    </div>

    <div className="pack-summary" aria-live="polite">
      <p className="heading-small">{pack.name} · {DIFFICULTIES[difficulty].label} · about {session.minutes} min</p>
      <p className="hint">{session.exercises.length} exercises · {DIFFICULTIES[difficulty].sets} sets each · {SETTINGS[setting].label}</p>
    </div>
    {session.exercises.length === 0
      ? <p className="notice">Nothing in {pack.name} fits {SETTINGS[setting].label} at this level. Try Home kit or Gym.</p>
      : session.missing > 0 && <p className="hint">Only {session.exercises.length} exercises in {pack.name} fit {SETTINGS[setting].label} at this level, so the day is shorter.</p>}

    <ol className="items pack-exercises">{session.exercises.map(({ entry, sets, minutes }) => <li key={entry.id} className="planned-exercise">
      <MuscleMap category={entry.category} muscles={entry.primaryMuscles} />
      <div>
        <div className="item-main"><span>{entry.name}</span><span className="numbers">{sets} sets · {minutes} min</span></div>
        <p className="hint">{entry.equipment!.length === 0 ? 'Bodyweight' : entry.equipment!.map(item => EQUIPMENT_LABELS[item]).join(', ')}{entry.level !== null && ` · ${LEVEL_LABELS[entry.level]}`}</p>
        <details className="exercise-instructions"><summary>Instructions</summary><p className="hint">{entry.cue}</p></details>
        {added.has(entry.id)
          ? <span className="hint selected-label"><CheckCircle size={16} weight="fill" />In my exercises</span>
          : <button type="button" className="button button-secondary pack-add" disabled={busy || active.length >= MAX_CUSTOM_CARDS} onClick={() => setReviewing(entry)}>Review and add</button>}
      </div>
    </li>)}</ol>
    <p className="hint">Sets and minutes are planning defaults, not a prescription. A suggestion only: log what you actually did on Today.</p>
    {reviewing && <ExerciseReview key={reviewing.id} entry={reviewing} onClose={() => setReviewing(null)} onConfirm={onAdd} />}
  </section>;
}

interface OptionGroupProps<T extends string> {
  legend: string;
  name: string;
  options: readonly [T, string][];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Display a labelled group of radio tiles where exactly one option is chosen.
 */
function OptionGroup<T extends string>({ legend, name, options, value, onChange }: OptionGroupProps<T>) {
  return <fieldset className="fieldset">
    <legend className="label">{legend}</legend>
    <div className="pack-options">{options.map(([option, label]) => <label key={option} className="equipment-mode">
      <input type="radio" name={name} value={option} checked={option === value} onChange={() => onChange(option)} /><span>{label}</span>
    </label>)}</div>
  </fieldset>;
}
