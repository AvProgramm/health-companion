import { useState, type FormEvent } from 'react';
import { buildFoodVersion } from '../../../domain/nutrition/foods';
import { NUTRIENT_KEYS, type FoodVersion, type NutrientKey, type NutrientValue, type SourceKind } from '../../../domain/nutrition/types';
import type { Unit } from '../../../domain/shared/units';
import { NUTRIENT_LABELS, errorText } from '../../format';
import { Sheet } from '../shared/Sheet';
import { ErrorLine } from '../shared/NoticeLine';
import { Field } from '../shared/Field';
import { useBusy } from '../../hooks/useBusy';

// The label fields, in the order printed on most nutrition panels
const EDITABLE_NUTRIENTS = NUTRIENT_KEYS;

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
  initialFood?: FoodVersion;
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
export function FoodEditor({ previous, initialFood, initialName, initialUnit, onSave, onClose }: FoodEditorProps) {
  const seed = initialFood ?? previous;
  const startUnit = seed?.basis.unit ?? initialUnit ?? 'g';
  const [name, setName] = useState(seed?.name ?? initialName ?? '');
  const [aliases, setAliases] = useState((seed?.aliases ?? []).join(', '));
  // Labels are usually per 100 g or 100 mL; counted foods usually per 1 piece
  const [basisAmount, setBasisAmount] = useState(seed !== undefined ? String(seed.basis.amount) : startUnit === 'piece' ? '1' : '100');
  const [basisUnit, setBasisUnit] = useState<Unit>(startUnit);
  // Open on a label only when the seed was one, because an edited estimate is the person's own
  const [sourceKind, setSourceKind] = useState<SourceKind>(seed === undefined || seed.source.kind === 'label' || seed.source.kind === 'fixture' ? 'label' : 'user_estimate');
  const [values, setValues] = useState<Record<NutrientKey, string>>(() => {
    const start = {} as Record<NutrientKey, string>;
    for (const key of EDITABLE_NUTRIENTS) {
      const value = seed?.nutrients[key];
      start[key] = value === undefined || value === null ? '' : String(value);
    }
    return start;
  });
  const { busy, error, setError, run } = useBusy();

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
      // Keep where a seed's numbers were found only while the person still says the same source
      const sourceReference = sourceKind === initialFood?.source.kind ? initialFood.source.reference : undefined;
      food = buildFoodVersion(
        { name, aliases: aliases.split(','), basis: { amount, unit: basisUnit }, nutrients, sourceKind, ...(sourceReference === undefined ? {} : { sourceReference }) },
        crypto.randomUUID(),
        previous,
      );
    } catch (problem) {
      setError(errorText(problem));
      return;
    }

    await run(async () => {
      await onSave(food);
      onClose();
    });
  }

  return (
    <Sheet title={previous === undefined ? 'Add a food' : `Edit ${previous.name}`} onClose={onClose}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <Field label="Name">
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" />
        </Field>

        <Field label="Other names you type" hint="Separate with commas. The composer recognises these.">
          <input className="input" value={aliases} onChange={(event) => setAliases(event.target.value)} placeholder="e.g. weetabix, wheat biscuit" autoComplete="off" />
        </Field>

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
          {initialFood?.source.kind === 'label' && initialFood.source.reference !== undefined && (
            <p className="hint" style={{ overflowWrap: 'anywhere' }}>{initialFood.source.reference}</p>
          )}
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
        <ErrorLine error={error} />

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
