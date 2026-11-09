import { foodKey } from '../../../domain/nutrition/aggregate';
import type { FoodVersion } from '../../../domain/nutrition/types';
import type { MealComponent, MealEdit } from '../../../domain/meals/types';
import { formatEaten, formatQuantity } from '../../format';
import { ChangeAmountEditor, ReplaceFoodEditor } from './MealItemEditors';

// The two editors an item can open
export type EditMode = 'change' | 'replace';

interface MealItemRowProps {
  component: MealComponent;
  foods: ReadonlyMap<string, FoodVersion>;
  currentFoods: readonly FoodVersion[];
  busy: boolean;
  nextRevision: number;
  // Which editor is open on this item, if any
  editMode: EditMode | null;
  onStartEdit: (mode: EditMode) => void;
  onCancelEdit: () => void;
  onSave: (edit: MealEdit, doneText: string) => void;
  onProblem: (text: string) => void;
}

/**
 * Show one item of a meal, with its buttons or the editor opened on it.
 */
export function MealItemRow({ component, foods, currentFoods, busy, nextRevision, editMode, onStartEdit, onCancelEdit, onSave, onProblem }: MealItemRowProps) {
  const food = foods.get(foodKey(component.foodId, component.foodVersion));
  const eatenText = formatEaten(component.eatenFraction);

  return (
    <li className="item item-editable">
      <div className="item-main">
        <span>{food?.name ?? 'Unknown food'}</span>
        <span className="numbers">
          {formatQuantity(component.served)}
          {eatenText !== '' && ` · ${eatenText}`}
        </span>
      </div>

      {editMode === null && (
        <div className="row">
          <button type="button" className="button button-secondary" aria-label={`Change amount of ${food?.name ?? 'item'}`} onClick={() => onStartEdit('change')}>Change amount</button>
          <button type="button" className="button button-quiet" aria-label={`Replace ${food?.name ?? 'item'}`} onClick={() => onStartEdit('replace')}>Replace</button>
          <button type="button" className="button button-quiet" aria-label={`Remove ${food?.name ?? 'item'}`} disabled={busy} onClick={() => onSave({ kind: 'remove_component', componentId: component.id }, `Removed ${food?.name ?? 'the item'}.`)}>
            Remove
          </button>
        </div>
      )}

      {editMode === 'change' && (
        <ChangeAmountEditor component={component} food={food} nextRevision={nextRevision} busy={busy} onSave={onSave} onCancel={onCancelEdit} onProblem={onProblem} />
      )}

      {editMode === 'replace' && (
        <ReplaceFoodEditor component={component} foods={foods} currentFoods={currentFoods} busy={busy} onSave={onSave} onCancel={onCancelEdit} onProblem={onProblem} />
      )}
    </li>
  );
}
