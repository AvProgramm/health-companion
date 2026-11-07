import { useState, type FormEvent } from 'react';
import { buildFoodVersion } from '../domain/foods';
import type { FoodVersion, NutrientKey, NutrientValue, SourceKind } from '../domain/types';
import type { Unit } from '../domain/units';
import { NUTRIENT_LABELS } from './format';
import { Sheet } from './Sheet';

// The label fields, in the order printed on most nutrition panels
const EDITABLE_NUTRIENTS: readonly NutrientKey[] = ['kcal', 'protein_g', 'fat_g', 'satfat_g', 'total_sugar_g', 'added_sugar_g'];

const UNIT_CHOICES: readonly { unit: Unit; label: string }[] = [
  { unit: 'g', label: 'g' },
  { unit: 'mL', label: 'mL' },
  { unit: 'piece', label: 'pieces' },
  { unit: 'kg', label: 'kg' },
  { unit: 'L', label: 'L' },
];

interface FoodEditorProps {
  // The version being edited, or undefined for a new food
  previous?: FoodVersion;
  // A name and unit to start with, e.g. the words the composer could not match
  initialName?: string;
  initialUnit?: Unit;
  onSave: (food: FoodVersion) => Promise<void>;
  onClose: () => void;
}

/**
 * The label editor. Saving an existing food creates its next version, so meals
 * saved earlier keep the numbers they were saved with.
 */
export function FoodEditor({ previous, initialName, initialUnit, onSave, onClose }: FoodEditorProps) {
  const startUnit = previous?.basis.unit ?? initialUnit ?? 'g';
  const [name, setName] = useState(previous?.name ?? initialName ?? '');
  const [aliases, setAliases] = useState((previous?.aliases ?? []).join(', '));
  // Labels are usually per 100 g or 100 mL; counted foods usually per 1 piece
  const [basisAmount, setBasisAmount] = useState(previous !== undefined ? String(previous.basis.amount) : startUnit === 'piece' ? '1' : '100');
  const [basisUnit, setBasisUnit] = useState<Unit>(startUnit);
  const [sourceKind, setSourceKind] = useState<SourceKind>(previous?.source.kind === 'user_estimate' ? 'user_estimate' : 'label');
  const [values, setValues] = useState<Record<NutrientKey, string>>(() => {
    const start = {} as Record<NutrientKey, string>;
    for (const key of EDITABLE_NUTRIENTS) {
      const value = previous?.nutrients[key];
      start[key] = value === undefined || value === null ? '' : String(value);
    }
    return start;
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Validate the form through buildFoodVersion and save the new version.
   */
  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    let food: FoodVersion;
    try {
      // A blank field means the label did not say, which is saved as unknown
      const nutrients: Partial<Record<NutrientKey, NutrientValue>> = {};
      for (const key of EDITABLE_NUTRIENTS) {
        nutrients[key] = readOptional(values[key], NUTRIENT_LABELS[key].label);
      }
      const amount = Number(basisAmount.trim().replace(',', '.'));
      food = buildFoodVersion(
        { name, aliases: aliases.split(','), basis: { amount, unit: basisUnit }, nutrients, sourceKind },
        crypto.randomUUID(),
        previous,
      );
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
      return;
    }

    setBusy(true);
    try {
      await onSave(food);
      onClose();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={previous === undefined ? 'Add a food' : `Edit ${previous.name}`} onClose={onClose}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span className="label">Name</span>
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" />
        </label>

        <label className="field">
          <span className="label">Other names you type</span>
          <input className="input" value={aliases} onChange={(event) => setAliases(event.target.value)} placeholder="e.g. weetabix, wheat biscuit" autoComplete="off" />
          <span className="hint">Separate with commas. The composer recognises these.</span>
        </label>

        <fieldset className="fieldset">
          <legend className="label">Values are per</legend>
          <div className="row">
            <input className="input input-short" inputMode="decimal" value={basisAmount} onChange={(event) => setBasisAmount(event.target.value)} aria-label="Label amount" />
            <select className="input" value={basisUnit} onChange={(event) => setBasisUnit(event.target.value as Unit)} aria-label="Label unit">
              {UNIT_CHOICES.map((choice) => (
                <option key={choice.unit} value={choice.unit}>{choice.label}</option>
              ))}
            </select>
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend className="label">Nutrition</legend>
          <p className="hint">Leave a field blank if the label does not say. It will show as unknown, never as zero.</p>
          <div className="grid-2">
            {EDITABLE_NUTRIENTS.map((key) => (
              <label key={key} className="field">
                <span className="hint">{NUTRIENT_LABELS[key].label} ({NUTRIENT_LABELS[key].unit})</span>
                <input
                  className="input"
                  inputMode="decimal"
                  value={values[key]}
                  onChange={(event) => setValues({ ...values, [key]: event.target.value })}
                />
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend className="label">Where the numbers came from</legend>
          <div className="row">
            <label className="choice">
              <input type="radio" name="source" checked={sourceKind === 'label'} onChange={() => setSourceKind('label')} />
              A nutrition label
            </label>
            <label className="choice">
              <input type="radio" name="source" checked={sourceKind === 'user_estimate'} onChange={() => setSourceKind('user_estimate')} />
              My estimate
            </label>
          </div>
        </fieldset>

        {previous !== undefined && (
          <p className="hint">Saving creates version {previous.version + 1}. Meals saved earlier keep version {previous.version}.</p>
        )}
        {error !== null && <p className="notice notice-error" role="alert">{error}</p>}

        <button type="submit" className="button" disabled={busy}>
          {busy ? 'Saving…' : 'Save food'}
        </button>
      </form>
    </Sheet>
  );
}

/**
 * Return a typed nutrient value, null for a blank field, or throw a readable error.
 */
function readOptional(text: string, label: string): NutrientValue {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') {
    return null;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a number, or blank if the label does not say.`);
  }
  return value;
}
