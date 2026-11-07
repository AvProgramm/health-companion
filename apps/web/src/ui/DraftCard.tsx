import { foodKey } from '../domain/nutrition/aggregate';
import type { DraftItem } from '../domain/parsing/types';
import { scaleNutrient } from '../domain/nutrition/scale';
import type { FoodVersion } from '../domain/nutrition/types';
import type { MealComponent } from '../domain/meals/types';
import { areCompatible, type Unit } from '../domain/shared/units';
import { readAmount, formatTotal, SOURCE_LABELS } from './format';
import { totalNutrient } from '../domain/nutrition/aggregate';
import { EstimateDraft } from './EstimateDraft';

// Every unit, filtered per row to the ones that fit the chosen food
const ALL_UNITS: readonly Unit[] = ['g', 'kg', 'mL', 'L', 'piece'];

// The eaten choices offered in a draft; finer amounts can be set later in the meal sheet
const EATEN_CHOICES: readonly { value: number; label: string }[] = [
  { value: 1, label: 'All of it' },
  { value: 0.75, label: 'Three quarters' },
  { value: 0.5, label: 'Half' },
  { value: 0.25, label: 'A quarter' },
];

/**
 * One editable row of a draft meal.
 */
export interface DraftRow {
  key: string;
  text: string;
  foodKey: string;
  amountText: string;
  unit: Unit;
  eatenFraction: number;
  problem: string | null;
}

/**
 * Return a draft row from a parsed item.
 */
export function toDraftRow(item: DraftItem): DraftRow {
  // For an unknown food, keep what was typed so it survives adding the food;
  // a bare count ("2 oatcakes") means pieces
  const typed = item.food === null ? item.typedAmount : null;
  return {
    key: crypto.randomUUID(),
    text: item.text,
    foodKey: item.food === null ? '' : foodKey(item.food.id, item.food.version),
    amountText: item.quantity !== null ? String(item.quantity.amount) : typed !== null ? String(typed.amount) : '',
    unit: item.quantity?.unit ?? (typed !== null ? typed.unit ?? 'piece' : undefined) ?? item.food?.basis.unit ?? 'g',
    eatenFraction: 1,
    problem: item.problem,
  };
}

/**
 * Return an empty row for "Add manually" and "Add another food".
 */
export function emptyDraftRow(): DraftRow {
  return { key: crypto.randomUUID(), text: '', foodKey: '', amountText: '', unit: 'g', eatenFraction: 1, problem: null };
}

/**
 * Return the meal components for a draft, or null while any row is incomplete.
 */
export function draftComponents(rows: readonly DraftRow[], foods: ReadonlyMap<string, FoodVersion>): MealComponent[] | null {
  const components: MealComponent[] = [];
  for (const row of rows) {
    const check = checkRow(row, foods);
    if (check.food === null || check.error !== null || check.amount === null) {
      return null;
    }
    components.push({
      id: row.key,
      foodId: check.food.id,
      foodVersion: check.food.version,
      served: { amount: check.amount, unit: row.unit },
      eatenFraction: row.eatenFraction,
      active: true,
    });
  }
  return components.length === 0 ? null : components;
}

/**
 * Return a row's food, amount, preview numbers and any problem stopping it being saved.
 */
function checkRow(row: DraftRow, foods: ReadonlyMap<string, FoodVersion>) {
  const food = foods.get(row.foodKey) ?? null;
  if (food === null) {
    return { food, amount: null, kcal: null, protein: null, error: row.problem ?? 'Choose a food.' };
  }
  const amount = readAmount(row.amountText);
  if (amount === null || amount === 0) {
    return { food, amount: null, kcal: null, protein: null, error: row.problem ?? `Enter how much, in ${unitLabel(row.unit)}.` };
  }
  // Preview with the same function the totals use, so the draft shows exactly what will be saved
  try {
    const served = { amount, unit: row.unit };
    const kcalTotal = totalNutrient({ components: [{ id: row.key, foodId: food.id, foodVersion: food.version,
      served, eatenFraction: row.eatenFraction, active: true }] }, foods, 'kcal');
    const kcal = kcalTotal.unknownItems > 0 ? null : kcalTotal.known;
    const protein = scaleNutrient(food.nutrients.protein_g ?? null, food.basis, served, row.eatenFraction);
    return { food, amount, kcal, kcalTotal, protein, error: null };
  } catch (problem) {
    return { food, amount: null, kcal: null, protein: null, error: problem instanceof Error ? problem.message : String(problem) };
  }
}

interface DraftCardProps {
  rows: DraftRow[];
  onRowsChange: (rows: DraftRow[]) => void;
  foods: ReadonlyMap<string, FoodVersion>;
  currentFoods: readonly FoodVersion[];
  hideNumbers: boolean;
  dateLabel: string;
  busy: boolean;
  onSave: (components: MealComponent[]) => void;
  onCancel: () => void;
  onUseEstimate: (food: FoodVersion, rowKey: string) => Promise<void>;
  onEditEstimate: (food: FoodVersion, rowKey: string, previous?: FoodVersion) => void;
  onCreateFood: (name: string, rowKey: string, unit: Unit) => void;
}

/**
 * The "Review meal, not saved yet" card: every row can be fixed before one save.
 */
export function DraftCard({ rows, onRowsChange, foods, currentFoods, hideNumbers, dateLabel, busy, onSave, onCancel, onCreateFood, onUseEstimate, onEditEstimate }: DraftCardProps) {
  const components = draftComponents(rows, foods);

  // Replace one row, keeping the others as they are
  const update = (key: string, change: Partial<DraftRow>) =>
    onRowsChange(rows.map((row) => (row.key === key ? { ...row, ...change, problem: null } : row)));

  return (
    <section className="card card-draft" aria-labelledby="draft-heading">
      <div className="card-head">
        <h2 id="draft-heading" className="heading">Review meal</h2>
        <span className="badge badge-warn">Not saved yet</span>
      </div>

      <ul className="draft-rows">
        {rows.map((row) => {
          const check = checkRow(row, foods);
          const food = check.food;
          const units = food === null ? ALL_UNITS : ALL_UNITS.filter((unit) => areCompatible(unit, food.basis.unit));
          return (
            <li key={row.key} className="draft-row">
              {row.text !== '' && <p className="hint">You wrote "{row.text}"</p>}

              <div className="row food-picker">
                <select
                  className="input"
                  aria-label="Food"
                  value={row.foodKey}
                  onChange={(event) => {
                    const chosen = foods.get(event.target.value);
                    // Switch to the new food's unit when the old unit cannot describe it
                    const unit = chosen !== undefined && !areCompatible(row.unit, chosen.basis.unit) ? chosen.basis.unit : row.unit;
                    update(row.key, { foodKey: event.target.value, unit });
                  }}
                >
                  <option value="">Choose a saved food</option>
                  {currentFoods.map((option) => (
                    <option key={foodKey(option.id, option.version)} value={foodKey(option.id, option.version)}>
                      {option.name}
                    </option>
                  ))}
                </select>
                <button type="button" className="button button-quiet" onClick={() => onRowsChange(rows.filter((other) => other.key !== row.key))}>
                  Remove
                </button>
              </div>

              {(food === null || Object.values(food.nutrients).every((value) => value == null)) && (
                <EstimateDraft name={food?.name ?? nameFromText(row.text)} portionText={row.amountText === '' ? '' : `${row.amountText} ${row.unit}`}
                  hideNumbers={hideNumbers} onUse={(accepted) => onUseEstimate(food === null ? accepted : { ...accepted, id: food.id, version: food.version + 1 }, row.key)} onEdit={(proposal) => onEditEstimate(proposal, row.key, food ?? undefined)} />
              )}
              {food === null && (
                <button type="button" className="button button-quiet manual-food-button" onClick={() => onCreateFood(nameFromText(row.text), row.key, row.unit)}>
                  Enter nutrition manually
                </button>
              )}

              {food !== null && (
                <div className="row">
                  <input
                    className="input input-short"
                    inputMode="decimal"
                    aria-label={`Amount of ${food.name}`}
                    value={row.amountText}
                    onChange={(event) => update(row.key, { amountText: event.target.value })}
                  />
                  <select className="input" aria-label="Unit" value={row.unit} onChange={(event) => update(row.key, { unit: event.target.value as Unit })}>
                    {units.map((unit) => (
                      <option key={unit} value={unit}>{unitLabel(unit)}</option>
                    ))}
                  </select>
                  <select className="input" aria-label="How much was eaten" value={row.eatenFraction} onChange={(event) => update(row.key, { eatenFraction: Number(event.target.value) })}>
                    {EATEN_CHOICES.map((choice) => (
                      <option key={choice.value} value={choice.value}>{choice.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {food !== null && <span className="badge">{SOURCE_LABELS[food.source.kind]}</span>}
              {check.error !== null && food !== null ? (
                <p className="field-error">{check.error}</p>
              ) : (
                !hideNumbers && food !== null && (
                  <p className="hint numbers">
                    {check.kcal === null ? 'kcal unknown' : formatTotal(check.kcalTotal!, 'kcal')} ·{' '}
                    {check.protein === null ? 'protein unknown' : `${check.protein.toFixed(1)} g protein`} · {food?.basis.amount} {food?.basis.unit} basis
                  </p>
                )
              )}
            </li>
          );
        })}
      </ul>

      <button type="button" className="button button-secondary" onClick={() => onRowsChange([...rows, emptyDraftRow()])}>
        Add another food
      </button>

      <div className="actions draft-actions">
        <button type="button" className="button" disabled={components === null || busy} onClick={() => components !== null && onSave(components)}>
          {busy ? 'Saving…' : `Save meal to ${dateLabel}`}
        </button>
        <button type="button" className="button button-quiet" onClick={onCancel}>
          Discard
        </button>
      </div>
    </section>
  );
}

/**
 * Return a unit as it reads in a sentence.
 */
function unitLabel(unit: Unit): string {
  return unit === 'piece' ? 'pieces' : unit;
}

/**
 * Return the likely food name from a row's text, without its leading amount.
 */
function nameFromText(text: string): string {
  return text.replace(/^[\d.,]+\s*(?:g|kg|ml|l|pieces?)?\s*(?:of\s+)?/i, '').trim();
}
