import { useEffect, useRef, useState } from 'react';
import { foodKey } from '../../../domain/nutrition/aggregate';
import type { FoodVersion } from '../../../domain/nutrition/types';
import type { MealComponent, MealEdit, MealRevision } from '../../../domain/meals/types';
import { areCompatible, type Unit } from '../../../domain/shared/units';
import { commitEdit, listRevisions, type SavedMeal } from '../../../storage/mealsRepo';
import { describeChange, nameOf } from '../../describe';
import { formatEaten, formatQuantity, formatTime, mealTitle, readAmount, errorText } from '../../format';
import { Sheet } from '../shared/Sheet';
import { NoticeLine } from '../shared/NoticeLine';

const ALL_UNITS: readonly Unit[] = ['g', 'kg', 'mL', 'L', 'piece'];

// "Leave some" choices; 0 keeps the item in the meal but counts none of it
const EATEN_CHOICES: readonly { value: number; label: string }[] = [
  { value: 1, label: 'All of it' },
  { value: 0.75, label: 'Three quarters' },
  { value: 0.5, label: 'Half' },
  { value: 0.25, label: 'A quarter' },
  { value: 0, label: 'None of it' },
];

interface MealSheetProps {
  db: IDBDatabase;
  meal: SavedMeal;
  foods: ReadonlyMap<string, FoodVersion>;
  currentFoods: readonly FoodVersion[];
  onClose: () => void;
  onChanged: () => Promise<void>;
  // Starts a new draft of this meal for today; nothing is saved until it is confirmed
  onLogAgain: () => void;
}

type Message = { kind: 'saved' | 'conflict' | 'error'; text: string };

/**
 * The meal sheet: change an amount, leave some, replace or remove an item,
 * undo the last change, delete or restore the meal, and read its history.
 * Every action saves a new revision through commitEdit.
 */
export function MealSheet({ db, meal, foods, currentFoods, onClose, onChanged, onLogAgain }: MealSheetProps) {
  const { header, latest } = meal;
  const [history, setHistory] = useState<MealRevision[]>([]);
  const [editing, setEditing] = useState<{ componentId: string; mode: 'change' | 'replace' } | null>(null);
  const [amountText, setAmountText] = useState('');
  const [unit, setUnit] = useState<Unit>('g');
  const [eaten, setEaten] = useState(1);
  const [replacementKey, setReplacementKey] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  // One key per intended change: a retry reuses it, and only a success replaces it
  const operationKey = useRef(crypto.randomUUID());

  // Reload the history whenever a new revision arrives
  useEffect(() => {
    listRevisions(db, header.mealId).then(setHistory, (problem: unknown) => setMessage({ kind: 'error', text: String(problem) }));
  }, [db, header.mealId, latest.revision]);

  /**
   * Save one edit against the revision on screen and report what happened.
   */
  async function commit(edit: MealEdit, doneText: string) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await commitEdit(
        db,
        { mealId: header.mealId, expectedRevision: latest.revision, edit, operationKey: operationKey.current, savedAt: new Date().toISOString() },
        foods,
      );
      if (result.status === 'conflict') {
        setMessage({ kind: 'conflict', text: `This meal changed since you opened it (now revision ${result.latest.revision}). Check it and try again.` });
      } else {
        setMessage({ kind: 'saved', text: doneText });
        operationKey.current = crypto.randomUUID();
        setEditing(null);
        setConfirmDelete(false);
      }
      await onChanged();
    } catch (problem) {
      setMessage({ kind: 'error', text: errorText(problem) });
    } finally {
      setBusy(false);
    }
  }

  /**
   * Open the change or replace editor for one item, starting from its saved values.
   */
  function startEditing(component: MealComponent, mode: 'change' | 'replace') {
    setEditing({ componentId: component.id, mode });
    setAmountText(mode === 'change' ? String(component.served.amount) : '');
    setUnit(component.served.unit);
    setEaten(component.eatenFraction);
    setReplacementKey('');
    setMessage(null);
  }

  /**
   * Save a new amount and eaten share for one item.
   */
  function saveChange(component: MealComponent) {
    const amount = readAmount(amountText);
    if (amount === null) {
      setMessage({ kind: 'error', text: 'Enter the amount as a number, for example 250.' });
      return;
    }
    commit(
      { kind: 'update_component', componentId: component.id, served: { amount, unit }, eatenFraction: eaten },
      `Saved revision ${latest.revision + 1}.`,
    );
  }

  /**
   * Swap one item for another food, keeping the old one in the history.
   */
  function saveReplacement(component: MealComponent) {
    const food = foods.get(replacementKey);
    const amount = readAmount(amountText);
    if (food === undefined || amount === null || amount === 0) {
      setMessage({ kind: 'error', text: 'Choose the food it was replaced with and enter how much.' });
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
    commit({ kind: 'replace_food', componentId: component.id, replacement }, `Replaced ${nameOf(component, foods)} with ${food.name}.`);
  }

  /**
   * Restore the revision before this one, as a new revision.
   */
  function undoLastChange() {
    const previous = history.find((revision) => revision.revision === latest.revision - 1);
    if (previous === undefined) {
      setMessage({ kind: 'error', text: 'The previous version is still loading. Try again.' });
      return;
    }
    commit(
      { kind: 'restore', fromRevision: previous.revision, components: previous.components, deleted: previous.deleted === true },
      latest.deleted === true ? 'Meal restored.' : `Undone. Revision ${latest.revision} stays in the history.`,
    );
  }

  const active = latest.components.filter((component) => component.active);
  const removed = latest.components.filter((component) => !component.active);
  const title = `${mealTitle(header.createdAt)} · ${formatTime(header.createdAt)}`;

  return (
    <Sheet title={title} onClose={onClose}>
      {latest.deleted === true ? (
        <div className="stack">
          <p className="body">This meal is deleted and does not count in the day's totals.</p>
          <button type="button" className="button" disabled={busy} onClick={undoLastChange}>Restore meal</button>
        </div>
      ) : (
        <div className="stack">
          <ul className="items">
            {active.map((component) => {
              const food = foods.get(foodKey(component.foodId, component.foodVersion));
              const isEditing = editing?.componentId === component.id;
              const editUnits = editing?.mode === 'replace' ? unitsFor(foods.get(replacementKey)) : unitsFor(food);
              const eatenText = formatEaten(component.eatenFraction);
              return (
                <li key={component.id} className="item item-editable">
                  <div className="item-main">
                    <span>{food?.name ?? 'Unknown food'}</span>
                    <span className="numbers">
                      {formatQuantity(component.served)}
                      {eatenText !== '' && ` · ${eatenText}`}
                    </span>
                  </div>

                  {!isEditing && (
                    <div className="row">
                      <button type="button" className="button button-secondary" aria-label={`Change amount of ${food?.name ?? 'item'}`} onClick={() => startEditing(component, 'change')}>Change amount</button>
                      <button type="button" className="button button-quiet" aria-label={`Replace ${food?.name ?? 'item'}`} onClick={() => startEditing(component, 'replace')}>Replace</button>
                      <button type="button" className="button button-quiet" aria-label={`Remove ${food?.name ?? 'item'}`} disabled={busy} onClick={() => commit({ kind: 'remove_component', componentId: component.id }, `Removed ${food?.name ?? 'the item'}.`)}>
                        Remove
                      </button>
                    </div>
                  )}

                  {isEditing && editing.mode === 'change' && (
                    <div className="editor">
                      <div className="row">
                        <input className="input input-short" inputMode="decimal" aria-label="Amount" value={amountText} onChange={(event) => setAmountText(event.target.value)} />
                        <select className="input" aria-label="Unit" value={unit} onChange={(event) => setUnit(event.target.value as Unit)}>
                          {editUnits.map((option) => <option key={option} value={option}>{option === 'piece' ? 'pieces' : option}</option>)}
                        </select>
                      </div>
                      <label className="field">
                        <span className="label">How much was eaten</span>
                        <select className="input" value={eaten} onChange={(event) => setEaten(Number(event.target.value))}>
                          {eatenOptions(component.eatenFraction).map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
                        </select>
                      </label>
                      <div className="row">
                        <button type="button" className="button" disabled={busy} onClick={() => saveChange(component)}>{busy ? 'Saving…' : 'Save change'}</button>
                        <button type="button" className="button button-quiet" onClick={() => setEditing(null)}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {isEditing && editing.mode === 'replace' && (
                    <div className="editor">
                      <select
                        className="input"
                        aria-label="Replaced with"
                        value={replacementKey}
                        onChange={(event) => {
                          setReplacementKey(event.target.value);
                          const chosen = foods.get(event.target.value);
                          if (chosen !== undefined) {
                            setUnit(chosen.basis.unit);
                          }
                        }}
                      >
                        <option value="">Replaced with…</option>
                        {currentFoods.map((option) => (
                          <option key={foodKey(option.id, option.version)} value={foodKey(option.id, option.version)}>{option.name}</option>
                        ))}
                      </select>
                      <div className="row">
                        <input className="input input-short" inputMode="decimal" aria-label="Amount" value={amountText} onChange={(event) => setAmountText(event.target.value)} />
                        <select className="input" aria-label="Unit" value={unit} onChange={(event) => setUnit(event.target.value as Unit)}>
                          {editUnits.map((option) => <option key={option} value={option}>{option === 'piece' ? 'pieces' : option}</option>)}
                        </select>
                      </div>
                      <div className="row">
                        <button type="button" className="button" disabled={busy} onClick={() => saveReplacement(component)}>{busy ? 'Saving…' : 'Save replacement'}</button>
                        <button type="button" className="button button-quiet" onClick={() => setEditing(null)}>Cancel</button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {removed.length > 0 && (
            <p className="hint">Removed from this meal: {removed.map((component) => nameOf(component, foods)).join(', ')}.</p>
          )}

          <div className="row">
            <button type="button" className="button button-secondary" disabled={busy} onClick={onLogAgain}>Log again today</button>
            {latest.revision > 1 && (
              <button type="button" className="button button-secondary" disabled={busy} onClick={undoLastChange}>Undo last change</button>
            )}
            {confirmDelete ? (
              <button type="button" className="button button-danger" disabled={busy} onClick={() => commit({ kind: 'delete_meal' }, 'Meal deleted. You can restore it from the day view.')}>
                Tap again to delete
              </button>
            ) : (
              <button type="button" className="button button-quiet" onClick={() => setConfirmDelete(true)}>Delete meal</button>
            )}
          </div>
        </div>
      )}

      <NoticeLine notice={message} />

      <section aria-labelledby="history-heading" className="stack">
        <h3 id="history-heading" className="label">History</h3>
        <ol className="history">
          {[...history].reverse().map((revision) => {
            const previous = history.find((other) => other.revision === revision.revision - 1);
            return (
              <li key={revision.revision}>
                <span className="history-main">{describeChange(previous, revision, foods)}</span>
                <span className="history-meta numbers">Revision {revision.revision} · {formatTime(revision.savedAt)}</span>
              </li>
            );
          })}
        </ol>
      </section>
    </Sheet>
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
