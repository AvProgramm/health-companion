import { useRef, useState } from 'react';
import { correctedQuantity, type CorrectionTarget } from '../../domain/meals/corrections';
import { startMeal } from '../../domain/meals/revisions';
import type { MealComponent } from '../../domain/meals/types';
import { foodKey } from '../../domain/nutrition/aggregate';
import type { FoodVersion, NutrientKey } from '../../domain/nutrition/types';
import type { ParsedAmount } from '../../domain/parsing/types';
import { deviceZone } from '../../domain/shared/dates';
import { areCompatible } from '../../domain/shared/units';
import type { ClockTime } from '../../domain/sleep/sleep';
import type { WorkoutDraft } from '../../domain/training/workouts';
import { commitEdit, confirmMeal, type CommitResult } from '../../data/storage/mealsRepo';
import type { DraftRow } from '../components/meals/DraftCard';
import { errorText } from '../format';
import type { Notice } from './useSave';

// What the area under the composer is showing
export type Panel =
  | { kind: 'draft'; rows: DraftRow[] }
  | { kind: 'correction'; amount: ParsedAmount; foodHint: string | null }
  | { kind: 'workout'; draft: WorkoutDraft }
  | { kind: 'sleep'; bed: ClockTime | null; wake: ClockTime | null; asleepMin: number | null }
  | { kind: 'answer'; nutrient: NutrientKey }
  | { kind: 'note'; text: string };

interface EntryPanelOptions {
  db: IDBDatabase;
  date: string;
  dateLabel: string;
  foods: ReadonlyMap<string, FoodVersion>;
  onSaveFood: (food: FoodVersion) => Promise<void>;
  setNotice: (notice: Notice | null) => void;
  reloadDay: () => Promise<void>;
}

/**
 * Return the panel under the composer and the saves that can close it.
 *
 * One operation key covers one intended save: a double tap or a retry reuses it,
 * so storage replays instead of saving twice. A new panel or a success replaces it.
 */
export function useEntryPanel({ db, date, dateLabel, foods, onSaveFood, setNotice, reloadDay }: EntryPanelOptions) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [busy, setBusy] = useState(false);
  const operationKey = useRef(crypto.randomUUID());

  /**
   * Show a new panel; a new intended action gets a new operation key.
   */
  function showPanel(next: Panel | null) {
    setPanel(next);
    setNotice(null);
    operationKey.current = crypto.randomUUID();
  }

  /**
   * Save a confirmed draft as revision 1 of a new meal on the shown date.
   */
  async function saveDraft(components: MealComponent[]) {
    const now = new Date();
    const zone = deviceZone();
    await runSave(
      () =>
        confirmMeal(
          db,
          startMeal({ mealId: crypto.randomUUID(), localDate: date, zone, savedAt: now.toISOString(), operationKey: operationKey.current, components }),
          foods,
        ),
      (result) => (result.replayed ? 'Already saved.' : `Saved to ${dateLabel}.`),
    );
  }

  /**
   * Save a confirmed correction against the revision that was previewed.
   */
  async function saveCorrection(target: CorrectionTarget, amount: ParsedAmount) {
    await runSave(
      () =>
        commitEdit(
          db,
          {
            mealId: target.meal.mealId,
            expectedRevision: target.meal.revision,
            operationKey: operationKey.current,
            savedAt: new Date().toISOString(),
            edit: { kind: 'update_component', componentId: target.component.id, served: correctedQuantity(amount), eatenFraction: target.component.eatenFraction },
          },
          foods,
        ),
      () => `Saved. ${target.food.name} is now ${correctedQuantity(amount).amount} ${correctedQuantity(amount).unit}.`,
    );
  }

  /**
   * Run one save, then close the panel on success or explain a conflict or error.
   */
  async function runSave(save: () => Promise<CommitResult>, successText: (result: Extract<CommitResult, { status: 'saved' }>) => string) {
    setBusy(true);
    try {
      const result = await save();
      if (result.status === 'conflict') {
        // Keep the panel open: it recomputes from the reloaded meals
        setNotice({ kind: 'conflict', text: `This meal changed since the preview (now revision ${result.latest.revision}). The preview is updated; check it and save again.` });
      } else {
        setPanel(null);
        setNotice({ kind: 'saved', text: successText(result) });
        operationKey.current = crypto.randomUUID();
      }
      await reloadDay();
    } catch (problem) {
      setNotice({ kind: 'error', text: errorText(problem) });
    } finally {
      setBusy(false);
    }
  }

  /**
   * Close a workout or sleep draft that saved itself, and show the new entry.
   */
  function closeSavedLog(savedText: string) {
    showPanel(null);
    setNotice({ kind: 'saved', text: savedText });
    reloadDay();
  }

  /**
   * Replace the rows of the open draft.
   */
  function setDraftRows(rows: DraftRow[]) {
    setPanel({ kind: 'draft', rows });
  }

  /**
   * Point one draft row at a food; a draft that has since closed is left alone.
   */
  function fillDraftRow(rowKey: string, food: FoodVersion, change: (row: DraftRow) => Partial<DraftRow>) {
    setPanel((current) => {
      if (current?.kind !== 'draft') {
        return current;
      }
      return { ...current, rows: current.rows.map((row) => (row.key === rowKey ? { ...row, ...change(row), foodKey: foodKey(food.id, food.version), problem: null } : row)) };
    });
  }

  /**
   * Keep an accepted estimate as a food and use its portion in the row that asked.
   */
  async function applyEstimate(food: FoodVersion, rowKey: string) {
    await onSaveFood(food);
    fillDraftRow(rowKey, food, () => ({ amountText: String(food.basis.amount), unit: food.basis.unit }));
  }

  /**
   * Keep a food made by hand and put it straight into the row that asked for it.
   *
   * An edited estimate brings its portion; otherwise what was typed stays, and
   * so does the typed unit when the label can describe it.
   */
  async function saveCreatedFood(food: FoodVersion, rowKey: string, editedEstimate: boolean) {
    await onSaveFood(food);
    fillDraftRow(rowKey, food, (row) => ({
      ...(editedEstimate ? { amountText: String(food.basis.amount) } : {}),
      unit: areCompatible(row.unit, food.basis.unit) ? row.unit : food.basis.unit,
    }));
  }

  return { panel, busy, showPanel, saveDraft, saveCorrection, closeSavedLog, setDraftRows, applyEstimate, saveCreatedFood };
}
