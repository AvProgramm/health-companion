import { useState } from 'react';
import { Field } from '../shared/Field';
import { foodKey } from '../../../domain/nutrition/aggregate';
import type { FoodVersion } from '../../../domain/nutrition/types';
import type { MealComponent, MealEdit } from '../../../domain/meals/types';
import { areCompatible, type Unit } from '../../../domain/shared/units';
import { nameOf } from '../../describe';
import { readAmount } from '../../format';

// Every unit a saved item can be measured in
const ALL_UNITS: readonly Unit[] = ['g', 'kg', 'mL', 'L', 'piece'];

// "Leave some" choices; 0 keeps the item in the meal but counts none of it
const EATEN_CHOICES: readonly { value: number; label: string }[] = [
  { value: 1, label: 'All of it' },
  { value: 0.75, label: 'Three quarters' },
  { value: 0.5, label: 'Half' },
  { value: 0.25, label: 'A quarter' },
  { value: 0, label: 'None of it' },
];

// What both editors need from the sheet
interface EditorProps {
  component: MealComponent;
  busy: boolean;
  onSave: (edit: MealEdit, doneText: string) => void;
  onCancel: () => void;
  onProblem: (text: string) => void;
}

interface ChangeAmountEditorProps extends EditorProps {
  food: FoodVersion | undefined;
  nextRevision: number;
}

interface ReplaceFoodEditorProps extends EditorProps {
  foods: ReadonlyMap<string, FoodVersion>;
  currentFoods: readonly FoodVersion[];
}

interface AmountFieldsProps {
  amountText: string;
  onAmountChange: (text: string) => void;
  unit: Unit;
  onUnitChange: (unit: Unit) => void;
  units: readonly Unit[];
}

/**
 * Show the amount box and the units the amount can be measured in.
 */
function AmountFields({ amountText, onAmountChange, unit, onUnitChange, units }: AmountFieldsProps) {
  return (
    <div className="row">
      <input className="input input-short" inputMode="decimal" aria-label="Amount" value={amountText} onChange={(event) => onAmountChange(event.target.value)} />
      <select className="input" aria-label="Unit" value={unit} onChange={(event) => onUnitChange(event.target.value as Unit)}>
        {units.map((option) => <option key={option} value={option}>{option === 'piece' ? 'pieces' : option}</option>)}
      </select>
    </div>
  );
}

/**
 * Let the person change how much of one item there was and how much was eaten.
 */
export function ChangeAmountEditor({ component, food, nextRevision, busy, onSave, onCancel, onProblem }: ChangeAmountEditorProps) {
  const [amountText, setAmountText] = useState(String(component.served.amount));
  const [unit, setUnit] = useState<Unit>(component.served.unit);
  const [eaten, setEaten] = useState(component.eatenFraction);

  /**
   * Save the new amount and eaten share, or say what is wrong with them.
   */
  function save() {
    const amount = readAmount(amountText);
    if (amount === null) {
      onProblem('Enter the amount as a number, for example 250.');
      return;
    }
    onSave({ kind: 'update_component', componentId: component.id, served: { amount, unit }, eatenFraction: eaten }, `Saved revision ${nextRevision}.`);
  }

  return (
    <div className="editor">
      <AmountFields amountText={amountText} onAmountChange={setAmountText} unit={unit} onUnitChange={setUnit} units={unitsFor(food)} />
      <Field label="How much was eaten">
        <select className="input" value={eaten} onChange={(event) => setEaten(Number(event.target.value))}>
          {eatenOptions(component.eatenFraction).map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
        </select>
      </Field>
      <div className="row">
        <button type="button" className="button" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save change'}</button>
        <button type="button" className="button button-quiet" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/**
 * Let the person swap one item for another food, keeping the old one in the history.
 */
export function ReplaceFoodEditor({ component, foods, currentFoods, busy, onSave, onCancel, onProblem }: ReplaceFoodEditorProps) {
  const [replacementKey, setReplacementKey] = useState('');
  const [amountText, setAmountText] = useState('');
  const [unit, setUnit] = useState<Unit>(component.served.unit);

  /**
   * Choose the replacement food and take on the unit its label uses.
   */
  function chooseFood(key: string) {
    setReplacementKey(key);
    const chosen = foods.get(key);
    if (chosen !== undefined) {
      setUnit(chosen.basis.unit);
    }
  }

  /**
   * Save the replacement as a new item, or say what is still missing.
   */
  function save() {
    const food = foods.get(replacementKey);
    const amount = readAmount(amountText);
    if (food === undefined || amount === null || amount === 0) {
      onProblem('Choose the food it was replaced with and enter how much.');
      return;
    }
    const replacement: MealComponent = {
      id: crypto.randomUUID(),
      foodId: food.id,
      foodVersion: food.version,
      served: { amount, unit },
      eatenFraction: 1,
      active: true,
    };
    onSave({ kind: 'replace_food', componentId: component.id, replacement }, `Replaced ${nameOf(component, foods)} with ${food.name}.`);
  }

  return (
    <div className="editor">
      <select className="input" aria-label="Replaced with" value={replacementKey} onChange={(event) => chooseFood(event.target.value)}>
        <option value="">Replaced with…</option>
        {currentFoods.map((option) => (
          <option key={foodKey(option.id, option.version)} value={foodKey(option.id, option.version)}>{option.name}</option>
        ))}
      </select>
      <AmountFields amountText={amountText} onAmountChange={setAmountText} unit={unit} onUnitChange={setUnit} units={unitsFor(foods.get(replacementKey))} />
      <div className="row">
        <button type="button" className="button" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save replacement'}</button>
        <button type="button" className="button button-quiet" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/**
 * Return the units that can describe a food, or every unit if no food is chosen yet.
 */
function unitsFor(food: FoodVersion | undefined): readonly Unit[] {
  return food === undefined ? ALL_UNITS : ALL_UNITS.filter((option) => areCompatible(option, food.basis.unit));
}

/**
 * Return the eaten choices, adding the saved value if it is not one of the presets.
 */
function eatenOptions(current: number): readonly { value: number; label: string }[] {
  if (EATEN_CHOICES.some((choice) => choice.value === current)) {
    return EATEN_CHOICES;
  }
  return [...EATEN_CHOICES, { value: current, label: `${Math.round(current * 100)}%` }];
}
