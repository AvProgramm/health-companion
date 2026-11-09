import { useState, type FormEvent, type ReactNode } from 'react';
import { ACTIVITY_LEVELS, SEXES, assertBodyFacts, bmiBand, bodyMassIndex, dailyEnergy, restingEnergy, type ActivityLevel, type BodyFacts, type Sex } from '../../../domain/profile/body';
import { readAmount } from '../../format';

// How each activity level reads in the list
const ACTIVITY_LABELS: Record<ActivityLevel, string> = { sedentary: 'Mostly sitting', light: 'Light, 1 to 3 days a week', moderate: 'Moderate, 3 to 5 days a week', active: 'Hard, 6 to 7 days a week', very_active: 'Very hard or physical work' };
// How each sex reads in the list; it is used only for the energy equation
const SEX_LABELS: Record<Sex, string> = { female: 'Female', male: 'Male' };
// How each BMI band reads, in neutral words
const BAND_LABELS = { below_range: 'below the usual range', in_range: 'within the usual range', overweight: 'in the overweight range', obese: 'in the obesity range' } as const;

interface BodyFactsFormProps {
  initial: BodyFacts | null;
  hideNumbers: boolean;
  currentYear: number;
  saving: boolean;
  submitLabel: string;
  onSubmit: (body: BodyFacts) => void;
  children?: ReactNode;
}

/** Return typed text as a whole number, or null when it is blank. */
function wholeOrNull(text: string): number | null {
  return text.trim() === '' ? null : Number(text);
}

/**
 * Ask for height and weight, and the optional facts that make estimates possible.
 *
 * The numbers shown update as you type, and nothing is saved until the button is pressed.
 */
export function BodyFactsForm({ initial, hideNumbers, currentYear, saving, submitLabel, onSubmit, children }: BodyFactsFormProps) {
  const [height, setHeight] = useState(initial?.heightCm.toString() ?? '');
  const [weight, setWeight] = useState(initial?.weightKg.toString() ?? '');
  const [birthYear, setBirthYear] = useState(initial?.birthYear?.toString() ?? '');
  const [sex, setSex] = useState<Sex | ''>(initial?.sex ?? '');
  const [activity, setActivity] = useState<ActivityLevel | ''>(initial?.activity ?? '');
  const [error, setError] = useState<string | null>(null);

  // The form as it stands, which is only usable once it passes the same check that saves it
  const draft: BodyFacts = { heightCm: readAmount(height) ?? Number.NaN, weightKg: readAmount(weight) ?? Number.NaN, birthYear: wholeOrNull(birthYear), sex: sex === '' ? null : sex, activity: activity === '' ? null : activity };
  const usable = isUsable(draft);

  /** Save the facts if they pass, or say what to fix. */
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      assertBodyFacts(draft);
      setError(null);
      onSubmit(draft);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    }
  }

  return (
    <form className="signup-form" onSubmit={handleSubmit} noValidate>
      <div className="signup-pair">
        <label className="signup-field"><span>Height (cm)</span><input id="body-height" className="input" inputMode="decimal" autoComplete="off" value={height} onChange={event => setHeight(event.target.value)} /></label>
        <label className="signup-field"><span>Weight (kg)</span><input id="body-weight" className="input" inputMode="decimal" autoComplete="off" value={weight} onChange={event => setWeight(event.target.value)} /></label>
      </div>

      <details className="signup-more"><summary>Add more for better estimates (optional)</summary>
        <label className="signup-field"><span>Birth year</span><input id="body-birth-year" className="input" inputMode="numeric" autoComplete="off" value={birthYear} onChange={event => setBirthYear(event.target.value)} /></label>
        <label className="signup-field"><span>Sex, for the energy equation</span>
          <select id="body-sex" className="input" value={sex} onChange={event => setSex(event.target.value as Sex | '')}><option value="">Prefer not to say</option>{SEXES.map(option => <option key={option} value={option}>{SEX_LABELS[option]}</option>)}</select></label>
        <label className="signup-field"><span>How active you usually are</span>
          <select id="body-activity" className="input" value={activity} onChange={event => setActivity(event.target.value as ActivityLevel | '')}><option value="">Not sure</option>{ACTIVITY_LEVELS.map(option => <option key={option} value={option}>{ACTIVITY_LABELS[option]}</option>)}</select></label>
      </details>

      {usable && !hideNumbers && <BodyNumbers body={draft} currentYear={currentYear} />}
      {error !== null && <p className="notice notice-error" role="alert">{error}</p>}

      <div className="signup-actions">
        {children}
        <button type="submit" className="signup-pill signup-pill-primary" disabled={saving}>{saving ? 'Saving…' : submitLabel}</button>
      </div>
    </form>
  );
}

/** Return whether the form currently holds believable facts. */
function isUsable(body: BodyFacts): boolean {
  try {
    assertBodyFacts(body);
    return true;
  } catch {
    return false;
  }
}

/**
 * Display what the facts work out to, saying which numbers are unknown and why.
 */
export function BodyNumbers({ body, currentYear }: { body: BodyFacts; currentYear: number }) {
  const bmi = bodyMassIndex(body);
  const resting = restingEnergy(body, currentYear);
  const daily = dailyEnergy(body, currentYear);

  return (
    <div className="signup-numbers" aria-live="polite">
      <div><span className="hint">BMI</span><strong className="numbers">{bmi.toFixed(1)}</strong><span className="hint">{BAND_LABELS[bmiBand(bmi)]}</span></div>
      <div><span className="hint">Resting energy</span><strong className="numbers">{resting === null ? 'Unknown' : `${Math.round(resting / 10) * 10} kcal`}</strong><span className="hint">{resting === null ? 'Add birth year and sex' : 'estimated, per day'}</span></div>
      <div><span className="hint">Daily energy</span><strong className="numbers">{daily === null ? 'Unknown' : `${Math.round(daily / 10) * 10} kcal`}</strong><span className="hint">{daily === null ? 'Needs age, sex and activity' : 'estimated, per day'}</span></div>
      <p className="hint signup-caveat">BMI is a rough guide using Malaysian adult cut-offs (overweight from 23, obesity from 27.5). It does not measure muscle, fitness or health. Estimates are not medical advice.</p>
    </div>
  );
}
