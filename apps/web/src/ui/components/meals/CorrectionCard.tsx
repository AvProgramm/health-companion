import { useState } from 'react';
import { totalNutrient } from '../../../domain/nutrition/aggregate';
import { correctedQuantity, findCorrectionTargets, type CorrectionTarget } from '../../../domain/meals/corrections';
import { summariseDay } from '../../../domain/nutrition/day';
import type { ParsedAmount } from '../../../domain/parsing/types';
import { reviseMeal } from '../../../domain/meals/revisions';
import type { FoodVersion } from '../../../domain/nutrition/types';
import type { MealRevision } from '../../../domain/meals/types';
import type { SavedMeal } from '../../../data/storage/mealsRepo';
import { formatQuantity, mealTitle, errorText } from '../../format';

interface CorrectionCardProps {
  date: string;
  dateLabel: string;
  meals: readonly SavedMeal[];
  foods: ReadonlyMap<string, FoodVersion>;
  amount: ParsedAmount;
  foodHint: string | null;
  hideNumbers: boolean;
  busy: boolean;
  onSave: (target: CorrectionTarget) => void;
  onCancel: () => void;
}

/**
 * The correction preview: which item "actually 250 mL" means, and what changes.
 *
 * With one fitting item it previews straight away; with several it asks which one,
 * so a correction is never applied to a guess.
 */
export function CorrectionCard({ date, dateLabel, meals, foods, amount, foodHint, hideNumbers, busy, onSave, onCancel }: CorrectionCardProps) {
  const [chosen, setChosen] = useState<{ mealId: string; componentId: string } | null>(null);
  const newQuantity = correctedQuantity(amount);
  const latest = meals.map((meal) => meal.latest);
  const targets = findCorrectionTargets(latest, foods, amount, foodHint);

  // No item fits: say why, and point to the meal sheet instead
  if (targets.length === 0) {
    const what = foodHint === null ? `measured in ${amount.unit ?? 'pieces'}` : `called "${foodHint}" measured in ${amount.unit ?? 'pieces'}`;
    return (
      <section className="card" aria-live="polite">
        <p className="body">Nothing on {dateLabel} is {what}, so there is nothing to change to {formatQuantity(newQuantity)}.</p>
        <p className="hint">Tap a meal below to change it directly.</p>
        <button type="button" className="button button-quiet" onClick={onCancel}>OK</button>
      </section>
    );
  }

  // Use the chosen item, or the only one when exactly one fits
  const target =
    targets.length === 1
      ? targets[0]!
      : targets.find((option) => option.meal.mealId === chosen?.mealId && option.component.id === chosen?.componentId);

  // Several items fit and none is chosen yet: ask which
  if (target === undefined) {
    return (
      <section className="card" aria-labelledby="which-heading">
        <h2 id="which-heading" className="heading">Which one is {formatQuantity(newQuantity)}?</h2>
        <div className="choice-list">
          {targets.map((option) => (
            <button
              key={`${option.meal.mealId}/${option.component.id}`}
              type="button"
              className="button button-secondary"
              onClick={() => setChosen({ mealId: option.meal.mealId, componentId: option.component.id })}
            >
              {option.food.name}, {formatQuantity(option.component.served)} · {mealTitle(mealCreatedAt(meals, option.meal))}
            </button>
          ))}
        </div>
        <button type="button" className="button button-quiet" onClick={onCancel}>Cancel</button>
      </section>
    );
  }

  // Preview the change with the same function the save will use
  const preview = previewChange(target, newQuantity, date, latest, foods);

  return (
    <section className="card card-draft" aria-labelledby="correction-heading">
      <div className="card-head">
        <h2 id="correction-heading" className="heading">Change {mealTitle(mealCreatedAt(meals, target.meal)).toLowerCase()}?</h2>
        <span className="badge badge-warn">Not saved yet</span>
      </div>
      <p className="body numbers">
        {target.food.name} {formatQuantity(target.component.served)} → <strong>{formatQuantity(newQuantity)}</strong>
      </p>
      {preview.error !== null ? (
        <p className="field-error">{preview.error}</p>
      ) : (
        !hideNumbers && (
          <dl className="readout numbers">
            <div>
              <dt>{target.food.name}</dt>
              <dd>{delta(preview.itemBefore.kcal, preview.itemAfter.kcal, 'kcal')}</dd>
            </div>
            <div>
              <dt>Protein</dt>
              <dd>{delta(preview.itemBefore.protein, preview.itemAfter.protein, 'g')}</dd>
            </div>
            <div>
              <dt>Day energy</dt>
              <dd>{delta(preview.dayBefore, preview.dayAfter, 'kcal')}</dd>
            </div>
          </dl>
        )
      )}
      <p className="hint">Only this item changes. Everything else in the meal stays as saved, and the old amount stays in its history.</p>
      <div className="actions">
        <button type="button" className="button" disabled={busy || preview.error !== null} onClick={() => onSave(target)}>
          {busy ? 'Saving…' : 'Save correction'}
        </button>
        <button type="button" className="button button-quiet" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}

/**
 * Return before and after numbers for the item and the day, or the reason it cannot be changed.
 */
function previewChange(target: CorrectionTarget, quantity: ReturnType<typeof correctedQuantity>, date: string, latest: readonly MealRevision[], foods: ReadonlyMap<string, FoodVersion>) {
  try {
    const result = reviseMeal(target.meal, {
      mealId: target.meal.mealId,
      expectedRevision: target.meal.revision,
      operationKey: 'preview',
      savedAt: new Date().toISOString(),
      edit: { kind: 'update_component', componentId: target.component.id, served: quantity, eatenFraction: target.component.eatenFraction },
    });
    if (result.status !== 'revised') {
      return { error: 'This meal changed; reopen the correction.', itemBefore: empty(), itemAfter: empty(), dayBefore: 0, dayAfter: 0 };
    }
    const next = result.next;
    const only = (revision: MealRevision) => ({ ...revision, components: revision.components.filter((component) => component.id === target.component.id) });
    const afterDay = latest.map((revision) => (revision.mealId === next.mealId ? next : revision));
    return {
      error: null,
      itemBefore: { kcal: totalNutrient(only(target.meal), foods, 'kcal').known, protein: totalNutrient(only(target.meal), foods, 'protein_g').known },
      itemAfter: { kcal: totalNutrient(only(next), foods, 'kcal').known, protein: totalNutrient(only(next), foods, 'protein_g').known },
      dayBefore: summariseDay(date, latest, foods).totals.kcal.known,
      dayAfter: summariseDay(date, afterDay, foods).totals.kcal.known,
    };
  } catch (problem) {
    return { error: errorText(problem), itemBefore: empty(), itemAfter: empty(), dayBefore: 0, dayAfter: 0 };
  }
}

/**
 * Return zeroed item numbers for a preview that could not be computed.
 */
function empty() {
  return { kcal: 0, protein: 0 };
}

/**
 * Return "133.0 → 110.8 kcal (−22.2)".
 */
function delta(before: number, after: number, unit: string): string {
  const change = after - before;
  const sign = change > 0 ? '+' : change < 0 ? '−' : '±';
  return `${before.toFixed(1)} → ${after.toFixed(1)} ${unit} (${sign}${Math.abs(change).toFixed(1)})`;
}

/**
 * Return when a meal was first saved, for its title.
 */
function mealCreatedAt(meals: readonly SavedMeal[], meal: MealRevision): string {
  return meals.find((saved) => saved.header.mealId === meal.mealId)?.header.createdAt ?? meal.savedAt;
}
