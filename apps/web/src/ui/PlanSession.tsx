import { EMPTY_PROFILE, type Profile } from '../domain/profile/profile';
import { useEffect, useState, type FormEvent } from 'react';
import { type Category, type MovementCard, type Equipment } from '../domain/training/catalogue';
import { bestPlan, type PlanResult } from '../domain/training/planner';
import { EQUIPMENT_LABELS } from './format';
import { CATEGORY_CHOICES, PlanResultView } from './PlanResultView';

// Every equipment type the planner understands, as it reads on a chip
const EQUIPMENT_CHOICES = Object.entries(EQUIPMENT_LABELS) as [Equipment, string][];

/**
 * Display the available equipment and return one checked session or an honest reason.
 *
 * The plan is only a suggestion; logging what was actually done stays on Today.
 */
export function PlanSession({ cards, profile = EMPTY_PROFILE }: { cards: readonly MovementCard[]; profile?: Profile }) {
  const [minutesText, setMinutesText] = useState('20');
  // Start with a bodyweight session; choosing an exercise does not establish equipment ownership.
  const [equipmentMode, setEquipmentMode] = useState<'without' | 'with'>('without');
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment[] | null>(null);
  // Repeat reviewed blocks only while this explicit session option is enabled.
  const [repeatRounds, setRepeatRounds] = useState(true);
  const [categories, setCategories] = useState<Category[]>(['push', 'pull']);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Suggest gear from explicitly added exercises, while offering only gear used by the pool.
  const equipmentChoices = EQUIPMENT_CHOICES.filter(([value]) => cards.some(card => card.equipment.includes(value)));
  const suggestedEquipment = [...new Set(cards.filter(card => card.id.startsWith('free-exercise-db:')).flatMap(card => card.equipment))];
  const equipment = (selectedEquipment ?? suggestedEquipment).filter(value => equipmentChoices.some(([option]) => option === value));


  // Ignore a stale result because the set of chosen exercises has changed.
  useEffect(() => setResult(null), [cards, profile]);

  /**
   * Run the planner on the form's values.
   */
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const minutes = Number(minutesText);

    // Check the time before planning, since every rule depends on it
    if (minutesText.trim() === '' || !Number.isSafeInteger(minutes) || minutes < 0) {
      setError('Enter a valid non-negative whole-minute target.');
      return;
    }

    // Ignore a session with no area chosen, because every exercise would be left out
    if (categories.length === 0) {
      setError('Choose at least one area to train.');
      return;
    }

    // Ignore an equipment session without selected gear because ownership must not be guessed.
    if (equipmentMode === 'with' && equipment.length === 0) {
      setError('Choose the equipment available today, or switch to Without equipment.');
      return;
    }

    // Pass the chosen kit through the existing hard filters; no capability profile is inferred here.
    setResult(bestPlan({ minutes, equipment: equipmentMode === 'without' ? [] : equipment, unableTo: profile.unableTo, avoidAreas: profile.avoidAreas, seatedOnly: profile.seatedOnly, neverSuggest: [], categories, preferences: {} }, cards, repeatRounds));
  }

  return (
    <section className="card plan-session-card" aria-labelledby="plan-heading">
      <div><p className="eyebrow">YOUR TIME, YOUR MOVEMENTS</p><h2 id="plan-heading" className="heading">Plan a session</h2></div>
      <p className="hint">Planning over {cards.length} reviewed or explicitly chosen exercises.</p>
      <form className="form" onSubmit={handleSubmit} onChange={() => setResult(null)}>
        <label className="field">
          <span className="label">Target duration (minutes)</span>
          <input className="input input-short" inputMode="numeric" value={minutesText} onChange={(event) => setMinutesText(event.target.value)} />
        </label>
        <fieldset className="fieldset">
          <legend className="label">Session setup</legend>
          <div className="equipment-modes">
            <label className="equipment-mode"><input type="radio" name="session-equipment" value="without" checked={equipmentMode === 'without'} onChange={() => { setEquipmentMode('without'); setError(null); }} /><span>Without equipment</span></label>
            <label className="equipment-mode"><input type="radio" name="session-equipment" value="with" checked={equipmentMode === 'with'} onChange={() => { setEquipmentMode('with'); setError(null); }} /><span>With equipment</span></label>
          </div>
        </fieldset>
        {equipmentMode === 'with' && <div className="session-equipment">
          <Choices legend="Available for this session" choices={equipmentChoices} selected={equipment} onChange={setSelectedEquipment} />
          <p className="hint">{suggestedEquipment.length > 0 ? 'Suggested from your added exercises. Keep only the gear you have today.' : 'Choose the gear you have today.'} Bodyweight movements can still be included.</p>
        </div>}
        <Choices legend="What to train" choices={CATEGORY_CHOICES} selected={categories} onChange={setCategories} />
        <label className="choice"><input type="checkbox" name="repeatRounds" checked={repeatRounds} onChange={event => setRepeatRounds(event.target.checked)} />Repeat rounds to fill the target</label>
        <button type="submit" className="button">Find a plan</button>
      </form>

      {error !== null && <p className="notice notice-error" role="alert">{error}</p>}

      <PlanResultView result={result} minutesText={minutesText} areaCount={categories.length} />
    </section>
  );
}

interface ChoicesProps<T extends string> {
  legend: string;
  choices: readonly [T, string][];
  selected: readonly T[];
  onChange: (selected: T[]) => void;
}

/**
 * Display a labelled group of checkboxes over a fixed list of choices.
 */
function Choices<T extends string>({ legend, choices, selected, onChange }: ChoicesProps<T>) {
  return (
    <fieldset className="fieldset">
      <legend className="label">{legend}</legend>
      <div className="row">
        {choices.map(([value, label]) => (
          <label key={value} className="choice">
            <input
              type="checkbox"
              value={value}
              checked={selected.includes(value)}
              onChange={(event) => onChange(event.target.checked ? [...selected, value] : selected.filter((item) => item !== value))}
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
