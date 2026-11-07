import { useEffect, useState, type FormEvent } from 'react';
import { type MovementCard, type Category, type Equipment } from '../domain/training/catalogue';
import { bestPlan, type PlanResult } from '../domain/training/planner';
import { MinutesRing } from './MinutesRing';
import { MuscleMap } from './MuscleMap';

// Label only the equipment types the existing planner understands.
const EQUIPMENT_CHOICES: readonly [Equipment, string][] = [['dumbbells', 'Dumbbells'], ['band', 'Resistance band'], ['pull_up_bar', 'Pull-up bar']];
// Keep the four training areas available in both equipment modes.
const CATEGORY_CHOICES: readonly [Category, string][] = [['push', 'Push'], ['pull', 'Pull'], ['legs', 'Legs'], ['core', 'Core']];

/**
 * Display the available equipment and return one checked session or an honest reason.
 *
 * The plan is only a suggestion; logging what was actually done stays on Today.
 */
export function PlanSession({ cards }: { cards: readonly MovementCard[] }) {
  const [minutesText, setMinutesText] = useState('20');
  // Start with a bodyweight session; choosing an exercise does not establish equipment ownership.
  const [equipmentMode, setEquipmentMode] = useState<'without' | 'with'>('without');
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment[] | null>(null);
  const [categories, setCategories] = useState<Category[]>(['push', 'pull']);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Suggest gear from explicitly added exercises, while offering only gear used by the pool.
  const equipmentChoices = EQUIPMENT_CHOICES.filter(([value]) => cards.some(card => card.equipment.includes(value)));
  const suggestedEquipment = [...new Set(cards.filter(card => card.id.startsWith('free-exercise-db:')).flatMap(card => card.equipment))];
  const equipment = (selectedEquipment ?? suggestedEquipment).filter(value => equipmentChoices.some(([option]) => option === value));

  // Ignore a stale result because the set of chosen exercises has changed.
  useEffect(() => setResult(null), [cards]);

  /**
   * Run the planner on the form's values.
   */
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const minutes = Number(minutesText);

    // Check the time before planning, since every rule depends on it
    if (minutesText.trim() === '' || !Number.isFinite(minutes) || minutes < 0) {
      setError('Enter the minutes you have, for example 20.');
      return;
    }

    // Ignore an equipment session without selected gear because ownership must not be guessed.
    if (equipmentMode === 'with' && equipment.length === 0) {
      setError('Choose the equipment available today, or switch to Without equipment.');
      return;
    }

    // Pass the chosen kit through the existing hard filters; no capability profile is inferred here.
    setResult(bestPlan({ minutes, equipment: equipmentMode === 'without' ? [] : equipment, unableTo: [], neverSuggest: [], categories, preferences: {} }, cards));
  }

  return (
    <section className="card plan-session-card" aria-labelledby="plan-heading">
      <div><p className="eyebrow">YOUR TIME, YOUR MOVEMENTS</p><h2 id="plan-heading" className="heading">Plan a session</h2></div>
      <p className="hint">Planning over {cards.length} reviewed or explicitly chosen exercises.</p>
      <form className="form" onSubmit={handleSubmit} onChange={() => setResult(null)}>
        <label className="field">
          <span className="label">Minutes you have</span>
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
        <button type="submit" className="button">Find a plan</button>
      </form>

      {error !== null && <p className="notice notice-error" role="alert">{error}</p>}

      {result?.status === 'plan' && (
        <div className="stack gym-plan-result" aria-live="polite">
          <div className="plan-overview"><MinutesRing used={result.plan.minutes} available={Number(minutesText)} /><div><p className="eyebrow">YOUR SESSION</p><h3 className="heading">A plan that fits.</h3><div className="coverage-chips">{CATEGORY_CHOICES.map(([value, label]) => <span className={`category-chip ${result.plan.cards.some(card => card.category === value) ? `category-${value}` : 'category-uncovered'}`} key={value}>{label}</span>)}</div></div></div>
          <ol className="items">
            {result.plan.cards.map((card) => (
              <li key={card.id} className="item planned-exercise">
                <MuscleMap category={card.category} muscles={card.primaryMuscles} /><div>
                <div className="item-main">
                  <span>{card.name}</span>
                  <span className="numbers">{card.minutes} min · {card.category}</span>
                </div>
                <details className="exercise-instructions"><summary>Instructions</summary><p className="hint">{card.cue}</p></details>
                </div>
              </li>
            ))}
          </ol>
          <p className="body numbers">
            {result.plan.minutes} of {minutesText} min · covers {result.plan.covered} of {categories.length} chosen areas
          </p>
          <p className="hint">Best of {result.considered} possible sessions. A suggestion only: log what you actually did on Today.</p>
        </div>
      )}

      {result?.status === 'none' && <p className="body" aria-live="polite">{result.reason}</p>}

      {result !== null && result.excluded.length > 0 && (
        <details>
          <summary className="hint">Why some exercises were left out</summary>
          <ul className="items">
            {result.excluded.map(({ card, reason }) => (
              <li key={card.id} className="hint">{card.name}: {reason}.</li>
            ))}
          </ul>
        </details>
      )}
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
