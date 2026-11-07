import { useState } from 'react';
import type { FoodVersion } from '../domain/nutrition/types';
import { FoodEditor } from './FoodEditor';
import { SOURCE_LABELS, formatQuantity, formatValue } from './format';

interface FoodsViewProps {
  currentFoods: readonly FoodVersion[];
  hideNumbers: boolean;
  onSaveFood: (food: FoodVersion) => Promise<void>;
}

/**
 * Saved foods: the labels the composer can recognise, each editable as a new version.
 */
export function FoodsView({ currentFoods, hideNumbers, onSaveFood }: FoodsViewProps) {
  // undefined: editor closed; null: adding a new food; a food: editing that food
  const [editing, setEditing] = useState<FoodVersion | null | undefined>(undefined);

  return (
    <>
      <header className="masthead">
        <h1 className="title">Foods</h1>
        <p className="status">Labels you save here are what the composer recognises by name.</p>
      </header>

      <button type="button" className="button" onClick={() => setEditing(null)}>Add a food</button>

      {currentFoods.length === 0 ? (
        <section className="card card-muted">
          <p className="body">No foods saved yet.</p>
          <p className="hint">Add the foods you eat most, copying the numbers from their labels. You can also add one straight from a meal you type.</p>
        </section>
      ) : (
        <ul className="food-list">
          {currentFoods.map((food) => (
            <li key={food.id}>
              <button type="button" className="card food-row" onClick={() => setEditing(food)}>
                <span className="item-main">
                  <span className="heading-small">{food.name}</span>
                  <span className="badge">{SOURCE_LABELS[food.source.kind]}</span>
                </span>
                <span className="hint numbers">
                  per {formatQuantity(food.basis)}
                  {!hideNumbers && ` · ${formatValue(food.nutrients.kcal ?? null, 'kcal')}`}
                  {food.version > 1 && ` · version ${food.version}`}
                </span>
                {(food.aliases ?? []).length > 0 && <span className="hint">Also: {(food.aliases ?? []).join(', ')}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing !== undefined && (
        <FoodEditor previous={editing ?? undefined} onSave={onSaveFood} onClose={() => setEditing(undefined)} />
      )}
    </>
  );
}
