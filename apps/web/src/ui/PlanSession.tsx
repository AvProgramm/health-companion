import { useState, type FormEvent } from 'react';
import { MOVEMENT_CARDS, type Capability, type Category, type Equipment } from '../domain/training/catalogue';
import { bestPlan, type PlanResult } from '../domain/training/planner';

// The choices on the form, as they read on screen
const EQUIPMENT_CHOICES: readonly [Equipment, string][] = [['dumbbells', 'Dumbbells'], ['band', 'Resistance band'], ['pull_up_bar', 'Pull-up bar']];
const CAPABILITY_CHOICES: readonly [Capability, string][] = [['pull_up', 'Pull-ups'], ['jumping', 'Jumping']];
const CATEGORY_CHOICES: readonly [Category, string][] = [['push', 'Push'], ['pull', 'Pull'], ['legs', 'Legs'], ['core', 'Core']];

/**
 * The "Plan a session" card: what you have today in, one checked plan (or an honest "none") out.
 *
 * The plan is only a suggestion; logging what was actually done stays on Today.
 */
export function PlanSession() {
  const [minutesText, setMinutesText] = useState('20');
  const [equipment, setEquipment] = useState<Equipment[]>(['dumbbells']);
  const [unableTo, setUnableTo] = useState<Capability[]>([]);
  const [categories, setCategories] = useState<Category[]>(['push', 'pull']);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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

    setResult(bestPlan({ minutes, equipment, unableTo, neverSuggest: [], categories, preferences: {} }, MOVEMENT_CARDS));
  }

  return (
    <section className="card" aria-labelledby="plan-heading">
      <h2 id="plan-heading" className="heading">Plan a session</h2>
      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="label">Minutes you have</span>
          <input className="input input-short" inputMode="numeric" value={minutesText} onChange={(event) => setMinutesText(event.target.value)} />
        </label>
        <Choices legend="Equipment you have" choices={EQUIPMENT_CHOICES} selected={equipment} onChange={setEquipment} />
        <Choices legend="You cannot do" choices={CAPABILITY_CHOICES} selected={unableTo} onChange={setUnableTo} />
        <Choices legend="What to train" choices={CATEGORY_CHOICES} selected={categories} onChange={setCategories} />
        <button type="submit" className="button">Find a plan</button>
      </form>

      {error !== null && <p className="notice notice-error" role="alert">{error}</p>}

      {result?.status === 'plan' && (
        <div className="stack" aria-live="polite">
          <ol className="items">
            {result.plan.cards.map((card) => (
              <li key={card.id} className="item">
                <div className="item-main">
                  <span>{card.name}</span>
                  <span className="numbers">{card.minutes} min · {card.category}</span>
                </div>
                <span className="hint">{card.cue}</span>
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
 * A labelled group of checkboxes over a fixed list of choices.
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
