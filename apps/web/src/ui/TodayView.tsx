import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { foodKey } from '../domain/nutrition/aggregate';
import { correctedQuantity, type CorrectionTarget } from '../domain/meals/corrections';
import { addDays, deviceZone, localDateIn } from '../domain/shared/dates';
import { summariseDay } from '../domain/nutrition/day';
import { parseEntry } from '../domain/parsing/parseEntry';
import type { ParsedAmount } from '../domain/parsing/types';
import { startMeal } from '../domain/meals/revisions';
import type { FoodVersion, NutrientKey } from '../domain/nutrition/types';
import type { MealComponent } from '../domain/meals/types';
import { areCompatible, type Unit } from '../domain/shared/units';
import type { ClockTime, SleepEntry } from '../domain/sleep/sleep';
import type { WorkoutDraft, WorkoutEntry } from '../domain/training/workouts';
import { logsOn } from '../storage/logsRepo';
import { commitEdit, confirmMeal, mealsOn, type CommitResult, type SavedMeal } from '../storage/mealsRepo';
import type { Durability } from '../storage/persistence';
import { CorrectionCard } from './CorrectionCard';
import { DaySummaryCard } from './DaySummaryCard';
import { DraftCard, emptyDraftRow, toDraftRow, type DraftRow } from './DraftCard';
import { FoodEditor } from './FoodEditor';
import { NUTRIENT_LABELS, formatDiaryDate, formatTotal } from './format';
import { MealCard } from './MealCard';
import { MealSheet } from './MealSheet';
import { SleepCard } from './SleepCard';
import { SleepDraftCard } from './SleepDraftCard';
import { errorText, type Notice } from './useSave';
import { WorkoutCard } from './WorkoutCard';
import { WorkoutDraftCard } from './WorkoutDraftCard';

// What the area under the composer is showing
type Panel =
  | { kind: 'draft'; rows: DraftRow[] }
  | { kind: 'correction'; amount: ParsedAmount; foodHint: string | null }
  | { kind: 'workout'; draft: WorkoutDraft }
  | { kind: 'sleep'; bed: ClockTime | null; wake: ClockTime | null; asleepMin: number | null }
  | { kind: 'answer'; nutrient: NutrientKey }
  | { kind: 'note'; text: string };

// What the status line under the date says for each storage answer
export const DURABILITY_TEXT: Record<Durability, string> = {
  persistent: 'Saved on this device.',
  'best-effort': 'Saved on this device. Chrome may clear it if storage runs low, so keep a backup (Me).',
  unknown: 'Saved on this device. Keep a backup (Me) in case the browser clears it.',
};

interface TodayViewProps {
  db: IDBDatabase;
  foods: ReadonlyMap<string, FoodVersion>;
  currentFoods: readonly FoodVersion[];
  hideNumbers: boolean;
  durability: Durability;
  onSaveFood: (food: FoodVersion) => Promise<void>;
}

/**
 * The Today screen: a date, a composer, the day's meals and its totals.
 *
 * Typed text goes through the grammar parser only. Nothing is saved until the
 * user confirms a draft or a correction.
 */
export function TodayView({ db, foods, currentFoods, hideNumbers, durability, onSaveFood }: TodayViewProps) {
  const today = localDateIn(deviceZone(), new Date());
  const [date, setDate] = useState(today);
  const [meals, setMeals] = useState<SavedMeal[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([]);
  const [sleeps, setSleeps] = useState<SleepEntry[]>([]);
  const [text, setText] = useState('');
  const [panel, setPanel] = useState<Panel | null>(null);
  const [openMealId, setOpenMealId] = useState<string | null>(null);
  const [creatingFood, setCreatingFood] = useState<{ name: string; rowKey: string; unit: Unit; initialFood?: FoodVersion } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  // One key per intended save: a double tap or retry reuses it, and only a success replaces it
  const operationKey = useRef(crypto.randomUUID());

  const dateLabel = date === today ? 'today' : formatDiaryDate(date);

  // Load the meals, training and sleep of the shown date
  const reloadDay = useCallback(async () => {
    try {
      const [dayMeals, dayWorkouts, daySleep] = await Promise.all([
        mealsOn(db, date),
        logsOn<WorkoutEntry>(db, 'workouts', date),
        logsOn<SleepEntry>(db, 'sleep', date),
      ]);
      setMeals(dayMeals);
      setWorkouts(dayWorkouts);
      setSleeps(daySleep);
    } catch (problem) {
      setNotice({ kind: 'error', text: errorText(problem) });
    }
  }, [db, date]);

  useEffect(() => {
    reloadDay();
  }, [reloadDay]);

  // The day's totals, from the latest revision of each meal
  const summary = useMemo(() => summariseDay(date, meals.map((meal) => meal.latest), foods), [date, meals, foods]);

  /**
   * Show a new panel; a new intended action gets a new operation key.
   */
  function showPanel(next: Panel | null) {
    setPanel(next);
    setNotice(null);
    operationKey.current = crypto.randomUUID();
  }

  /**
   * Read the composer text with the grammar parser and show what it means.
   */
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = parseEntry(text, currentFoods);

    switch (result.kind) {
      case 'empty':
        return;
      case 'meal':
        showPanel({ kind: 'draft', rows: result.items.map(toDraftRow) });
        break;
      case 'correction':
        showPanel({ kind: 'correction', amount: result.amount, foodHint: result.foodHint });
        break;
      case 'workout':
        showPanel({ kind: 'workout', draft: result.draft });
        break;
      case 'sleep':
        showPanel({ kind: 'sleep', bed: result.bed, wake: result.wake, asleepMin: result.asleepMin });
        break;
      case 'question':
        showPanel({ kind: 'answer', nutrient: result.nutrient });
        break;
      case 'unknown':
        showPanel({ kind: 'note', text: 'That is not something the diary can answer yet. Try "2 weetabix and 300 ml milk", "row 3x8 at 5kg each hand", "slept 23:30 to 7", or "how much protein today?".' });
        return;
    }
    setText('');
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

  const openMeal = meals.find((meal) => meal.header.mealId === openMealId);

  return (
    <>
      <header className="masthead">
        <nav className="date-nav" aria-label="Choose day">
          <button type="button" className="button button-quiet" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>‹</button>
          <h1 className="title">{formatDiaryDate(date)}</h1>
          <button type="button" className="button button-quiet" aria-label="Next day" disabled={date >= today} onClick={() => setDate(addDays(date, 1))}>›</button>
          {date !== today && (
            <button type="button" className="button button-quiet" onClick={() => setDate(today)}>Today</button>
          )}
        </nav>
        <p className="status">{DURABILITY_TEXT[durability]}</p>
      </header>

      <form className="composer" onSubmit={handleSubmit}>
        <label htmlFor="composer" className="label">What did you eat, train or sleep, or what should change?</label>
        <textarea
          id="composer"
          className="input composer-input"
          rows={2}
          value={text}
          placeholder={'2 weetabix and 300 ml milk\nrow 3x8 at 5kg each hand · slept 23:30 to 7'}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter makes a new line
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="row">
          <button type="submit" className="button">Read it</button>
          <button type="button" className="button button-secondary" onClick={() => showPanel({ kind: 'draft', rows: [emptyDraftRow()] })}>
            Add manually
          </button>
        </div>
        <p className="hint">Read on this device by a fixed grammar. Nothing is saved until you confirm.</p>
      </form>

      {notice !== null && (
        <p className={`notice notice-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</p>
      )}

      {panel?.kind === 'draft' && (
        <DraftCard
          rows={panel.rows}
          onRowsChange={(rows) => setPanel({ kind: 'draft', rows })}
          foods={foods}
          currentFoods={currentFoods}
          hideNumbers={hideNumbers}
          dateLabel={dateLabel}
          busy={busy}
          onSave={saveDraft}
          onCancel={() => showPanel(null)}
          onUseEstimate={async (food, rowKey) => {
            await onSaveFood(food);
            setPanel((current) => current?.kind === 'draft' ? { ...current, rows: current.rows.map((row) =>
              row.key === rowKey ? { ...row, foodKey: foodKey(food.id, food.version), amountText: String(food.basis.amount), unit: food.basis.unit, problem: null } : row) } : current);
          }}
          onEditEstimate={(food, rowKey) => setCreatingFood({ name: food.name, rowKey, unit: food.basis.unit, initialFood: food })}
          onCreateFood={(name, rowKey, unit) => setCreatingFood({ name, rowKey, unit })}
        />
      )}

      {panel?.kind === 'correction' && (
        <CorrectionCard
          date={date}
          dateLabel={dateLabel}
          meals={meals}
          foods={foods}
          amount={panel.amount}
          foodHint={panel.foodHint}
          hideNumbers={hideNumbers}
          busy={busy}
          onSave={(target) => saveCorrection(target, panel.amount)}
          onCancel={() => showPanel(null)}
        />
      )}

      {panel?.kind === 'workout' && (
        <WorkoutDraftCard
          db={db}
          date={date}
          dateLabel={dateLabel}
          zone={deviceZone()}
          draft={panel.draft}
          onSaved={(savedText) => {
            showPanel(null);
            setNotice({ kind: 'saved', text: savedText });
            reloadDay();
          }}
          onCancel={() => showPanel(null)}
        />
      )}

      {panel?.kind === 'sleep' && (
        <SleepDraftCard
          db={db}
          date={date}
          dateLabel={dateLabel}
          zone={deviceZone()}
          bed={panel.bed}
          wake={panel.wake}
          asleepMin={panel.asleepMin}
          onSaved={(savedText) => {
            showPanel(null);
            setNotice({ kind: 'saved', text: savedText });
            reloadDay();
          }}
          onCancel={() => showPanel(null)}
        />
      )}

      {panel?.kind === 'answer' && (
        <section className="card" aria-live="polite">
          <p className="body">{answerText(panel.nutrient, summary, dateLabel, hideNumbers)}</p>
          <p className="hint">Answered from your diary on this device. No AI was used.</p>
          <button type="button" className="button button-quiet" onClick={() => showPanel(null)}>OK</button>
        </section>
      )}

      {panel?.kind === 'note' && (
        <section className="card" aria-live="polite">
          <p className="body">{panel.text}</p>
          <div className="row">
            <button type="button" className="button button-secondary" onClick={() => showPanel({ kind: 'draft', rows: [emptyDraftRow()] })}>Add manually</button>
            <button type="button" className="button button-quiet" onClick={() => showPanel(null)}>OK</button>
          </div>
        </section>
      )}

      <section className="timeline" aria-label={`Diary for ${dateLabel}`}>
        {sleeps.map((entry) => (
          <SleepCard key={entry.id} db={db} entry={entry} onChanged={reloadDay} />
        ))}
        {meals.map((meal) => (
          <MealCard key={meal.header.mealId} meal={meal} foods={foods} hideNumbers={hideNumbers} onOpen={() => setOpenMealId(meal.header.mealId)} />
        ))}
        {workouts.map((entry) => (
          <WorkoutCard key={entry.id} db={db} entry={entry} onChanged={reloadDay} />
        ))}
      </section>

      <DaySummaryCard summary={summary} dateLabel={dateLabel} hideNumbers={hideNumbers} />

      {openMeal !== undefined && (
        <MealSheet
          db={db}
          meal={openMeal}
          foods={foods}
          currentFoods={currentFoods}
          onClose={() => setOpenMealId(null)}
          onChanged={reloadDay}
        />
      )}

      {creatingFood !== null && (
        <FoodEditor
          initialFood={creatingFood.initialFood}
          initialName={creatingFood.name}
          initialUnit={creatingFood.unit}
          onClose={() => setCreatingFood(null)}
          onSave={async (food) => {
            await onSaveFood(food);
            // Put the new food straight into the draft row that asked for it,
            // keeping the typed unit when the label can describe it
            const rowKey = creatingFood.rowKey;
            if (panel?.kind === 'draft') {
              setPanel({
                kind: 'draft',
                rows: panel.rows.map((row) =>
                  row.key === rowKey
                    ? { ...row, ...(creatingFood.initialFood === undefined ? {} : { amountText: String(food.basis.amount) }), foodKey: foodKey(food.id, food.version), unit: areCompatible(row.unit, food.basis.unit) ? row.unit : food.basis.unit, problem: null }
                    : row,
                ),
              });
            }
          }}
        />
      )}
    </>
  );
}

/**
 * Return the answer to "how much protein today?" from the day summary.
 */
function answerText(nutrient: NutrientKey, summary: ReturnType<typeof summariseDay>, dateLabel: string, hideNumbers: boolean): string {
  const { label, unit } = NUTRIENT_LABELS[nutrient];
  if (summary.coverage === 'no_entries') {
    return `Nothing is logged for ${dateLabel}, so ${label.toLowerCase()} is unknown, not zero.`;
  }
  if (hideNumbers) {
    return 'Numbers are hidden. Turn them back on in Me to see this total.';
  }
  const meals = `${summary.mealCount} ${summary.mealCount === 1 ? 'meal' : 'meals'}`;
  return `${label} for ${dateLabel}: ${formatTotal(summary.totals[nutrient], unit)}, from ${meals} logged.`;
}
