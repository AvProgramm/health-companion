import { foodKey } from '../domain/nutrition/aggregate';
import { scaleNutrient } from '../domain/nutrition/scale';
import type { FoodVersion } from '../domain/nutrition/types';
import type { SavedMeal } from '../storage/mealsRepo';
import { NUTRIENT_LABELS, SOURCE_LABELS, describeSource, formatEaten, formatQuantity, formatTime, formatValue, mealTitle } from './format';

interface MealCardProps {
  diabetes?: boolean;
  meal: SavedMeal;
  foods: ReadonlyMap<string, FoodVersion>;
  hideNumbers: boolean;
  onOpen: () => void;
}

/**
 * One saved meal in the day's timeline, with each item's amount, source and numbers.
 */
export function MealCard({ diabetes = false, meal, foods, hideNumbers, onOpen }: MealCardProps) {
  const { header, latest } = meal;
  const title = `${mealTitle(header.createdAt)} · ${formatTime(header.createdAt)}`;

  // A deleted meal keeps a one-line placeholder so it can be restored
  if (latest.deleted === true) {
    return (
      <article className="card card-muted">
        <div className="card-head">
          <p className="body">{title} · deleted</p>
          <button type="button" className="button button-quiet" onClick={onOpen}>Restore</button>
        </div>
      </article>
    );
  }

  const active = latest.components.filter((component) => component.active);

  return (
    <article className="card meal-card">
      <div className="card-head">
        <h3 className="heading">{title}</h3>
        {latest.revision > 1 && <span className="badge">Edited</span>}
        <button type="button" className="button button-quiet" onClick={onOpen} aria-label={`Change ${title}`}>
          Change
        </button>
      </div>

      {active.length === 0 && <p className="hint">Every item was removed from this meal.</p>}

      <ul className="items">
        {active.map((component) => {
          const food = foods.get(foodKey(component.foodId, component.foodVersion));
          if (food === undefined) {
            return <li key={component.id} className="field-error">This item's food is missing.</li>;
          }
          // Each row uses the same scaling as the day total
          const kcal = scaleNutrient(food.nutrients.kcal ?? null, food.basis, component.served, component.eatenFraction);
          const protein = scaleNutrient(food.nutrients.protein_g ?? null, food.basis, component.served, component.eatenFraction);
          const eaten = formatEaten(component.eatenFraction);
          return (
            <li key={component.id} className="item">
              <div className="item-main">
                <span>{food.name}</span>
                <span className="numbers">
                  {formatQuantity(component.served)}
                  {eaten !== '' && ` · ${eaten}`}
                </span>
              </div>
              <div className="item-meta">
                <span className="badge">{SOURCE_LABELS[food.source.kind]}</span>
                {!hideNumbers && (
                  <span className="numbers">
                    {diabetes && <span className="diabetes-readout">{(['carbs_g', 'added_sugar_g', 'fibre_g'] as const).map(key => <span key={key}>{NUTRIENT_LABELS[key].label}: {formatValue(scaleNutrient(food.nutrients[key] ?? null, food.basis, component.served, component.eatenFraction), NUTRIENT_LABELS[key].unit)} · </span>)}</span>}
                    {formatValue(kcal, 'kcal')} · {protein === null ? 'protein unknown' : `${protein.toFixed(1)} g protein`}
                  </span>
                )}
              </div>
              {describeSource(food.source) !== null && <details className="hint"><summary>Sources and assumptions</summary><p>{describeSource(food.source)}</p></details>}
            </li>
          );
        })}
      </ul>
    </article>
  );
}
