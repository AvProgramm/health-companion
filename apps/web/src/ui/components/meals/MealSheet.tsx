import { useEffect, useRef, useState } from 'react';
import type { FoodVersion } from '../../../domain/nutrition/types';
import type { MealEdit, MealRevision } from '../../../domain/meals/types';
import { commitEdit, listRevisions, type SavedMeal } from '../../../storage/mealsRepo';
import { nameOf } from '../../describe';
import { errorText, formatTime, mealTitle } from '../../format';
import type { Notice } from '../../hooks/useSave';
import { NoticeLine } from '../shared/NoticeLine';
import { Sheet } from '../shared/Sheet';
import { MealHistory } from './MealHistory';
import { MealItemRow, type EditMode } from './MealItemRow';

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

/**
 * The meal sheet: change an amount, leave some, replace or remove an item,
 * undo the last change, delete or restore the meal, and read its history.
 * Every action saves a new revision through commitEdit.
 */
export function MealSheet({ db, meal, foods, currentFoods, onClose, onChanged, onLogAgain }: MealSheetProps) {
  const { header, latest } = meal;
  const [history, setHistory] = useState<MealRevision[]>([]);
  const [editing, setEditing] = useState<{ componentId: string; mode: EditMode } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Notice | null>(null);

  // One key per intended change: a retry reuses it, and only a success replaces it
  const operationKey = useRef(crypto.randomUUID());

  // Reload the history whenever a new revision arrives
  useEffect(() => {
    listRevisions(db, header.mealId).then(setHistory, (problem: unknown) => setMessage({ kind: 'error', text: errorText(problem) }));
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
   * Open the change or replace editor on one item.
   */
  function startEditing(componentId: string, mode: EditMode) {
    setEditing({ componentId, mode });
    setMessage(null);
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
            {active.map((component) => (
              <MealItemRow
                key={component.id}
                component={component}
                foods={foods}
                currentFoods={currentFoods}
                busy={busy}
                nextRevision={latest.revision + 1}
                editMode={editing?.componentId === component.id ? editing.mode : null}
                onStartEdit={(mode) => startEditing(component.id, mode)}
                onCancelEdit={() => setEditing(null)}
                onSave={commit}
                onProblem={(text) => setMessage({ kind: 'error', text })}
              />
            ))}
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

      <MealHistory history={history} foods={foods} />
    </Sheet>
  );
}
