import { useMemo, useState, type FormEvent } from 'react';
import { deviceZone } from '../../domain/shared/dates';
import { summariseDay } from '../../domain/nutrition/day';
import { parseEntry } from '../../domain/parsing/parseEntry';
import type { BodyFacts } from '../../domain/profile/body';
import type { FoodVersion } from '../../domain/nutrition/types';
import type { Unit } from '../../domain/shared/units';
import type { SavedMeal } from '../../storage/mealsRepo';
import type { Durability } from '../../storage/persistence';
import { CorrectionCard } from '../components/meals/CorrectionCard';
import { DraftCard, emptyDraftRow, repeatRows, toDraftRow } from '../components/meals/DraftCard';
import { BarcodeScan } from '../components/meals/BarcodeScan';
import { FoodEditor } from '../components/meals/FoodEditor';
import { MealSheet } from '../components/meals/MealSheet';
import { PlatePhoto } from '../components/meals/PlatePhoto';
import { NoticeLine } from '../components/shared/NoticeLine';
import { SleepDraftCard } from '../components/sleep/SleepDraftCard';
import { AnswerCard } from '../components/today/AnswerCard';
import { Composer } from '../components/today/Composer';
import { DaySidebar } from '../components/today/DaySidebar';
import { DayTimeline } from '../components/today/DayTimeline';
import { NoteCard } from '../components/today/NoteCard';
import { TodayMasthead } from '../components/today/TodayMasthead';
import { WorkoutDraftCard } from '../components/training/WorkoutDraftCard';
import { formatDiaryDate } from '../format';
import { useDiaryDay } from '../hooks/useDiaryDay';
import { useEntryPanel } from '../hooks/useEntryPanel';
import type { Notice } from '../hooks/useSave';
import { useToday } from '../hooks/useToday';

// A food being made for one draft row, and what the form starts from
interface CreatingFood {
  name: string;
  rowKey: string;
  unit: Unit;
  initialFood?: FoodVersion;
  previous?: FoodVersion;
}

interface TodayViewProps {
  // Text handed over by the Nutritionist, which only fills the entry box
  initialEntry?: string;
  // Used only for on-device estimates; null means those stay unknown
  body?: BodyFacts | null;
  db: IDBDatabase;
  foods: ReadonlyMap<string, FoodVersion>;
  currentFoods: readonly FoodVersion[];
  hideNumbers: boolean;
  diabetes?: boolean;
  durability: Durability;
  onSaveFood: (food: FoodVersion) => Promise<void>;
}

/**
 * The Today screen: a date, a composer, the day's meals and its totals.
 *
 * Typed text goes through the grammar parser only. Nothing is saved until the
 * user confirms a draft or a correction.
 */
export function TodayView({ db, foods, currentFoods, hideNumbers, durability, diabetes = false, initialEntry = '', body = null, onSaveFood }: TodayViewProps) {
  const today = useToday();
  const [notice, setNotice] = useState<Notice | null>(null);
  const { date, setDate, meals, workouts, sleeps, reloadDay } = useDiaryDay(db, today, setNotice);
  const dateLabel = date === today ? 'today' : formatDiaryDate(date);
  // A food found by barcode, waiting to be reviewed before it is saved
  const [scanned, setScanned] = useState<FoodVersion | null>(null);
  const { panel, busy, showPanel, saveDraft, saveCorrection, closeSavedLog, setDraftRows, applyEstimate, saveCreatedFood } = useEntryPanel({ db, date, dateLabel, foods, onSaveFood, setNotice, reloadDay });
  const [text, setText] = useState(initialEntry);
  const [openMealId, setOpenMealId] = useState<string | null>(null);
  const [creatingFood, setCreatingFood] = useState<CreatingFood | null>(null);

  // The day's totals, from the latest revision of each meal
  const summary = useMemo(() => summariseDay(date, meals.map((meal) => meal.latest), foods), [date, meals, foods]);

  /**
   * Open an empty draft, for when typing did not get the food across.
   */
  function startManualDraft() {
    showPanel({ kind: 'draft', rows: [emptyDraftRow()] });
  }

  /**
   * Fill the entry box from a photo guess; the normal review still decides what is saved.
   */
  function fillEntryFromPhoto(dish: string) {
    setText(`${dish} 1 plate`);
    document.getElementById('composer')?.focus();
  }

  /**
   * Fill the entry box with the foods an AI listed from a photo, for review like any typed meal.
   */
  function fillEntryFromList(entry: string) {
    setText(entry);
    document.getElementById('composer')?.focus();
  }

  /**
   * Start a draft of a saved meal for today, which still has to be confirmed.
   */
  function logAgain(meal: SavedMeal) {
    setOpenMealId(null);
    setDate(today);
    showPanel({ kind: 'draft', rows: repeatRows(meal.latest, currentFoods) });

    // The draft opens above the diary, so bring it into view
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  const openMeal = meals.find((meal) => meal.header.mealId === openMealId);

  return (
    <>
      <TodayMasthead date={date} today={today} onDateChange={setDate} />

      <div className="today-layout">
      <div className="today-main">
      {panel === null && <PlatePhoto onPick={fillEntryFromPhoto} onEntry={fillEntryFromList} />}
      {panel === null && <BarcodeScan onFound={setScanned} />}
      {scanned !== null && <FoodEditor key={scanned.id} initialFood={scanned} onSave={onSaveFood} onClose={() => setScanned(null)} />}

      <Composer text={text} onTextChange={setText} reviewing={panel !== null} onSubmit={handleSubmit} onAddManually={startManualDraft} />

      <NoticeLine notice={notice} />

      {panel?.kind === 'draft' && (
        <DraftCard
          rows={panel.rows}
          onRowsChange={setDraftRows}
          foods={foods}
          currentFoods={currentFoods}
          hideNumbers={hideNumbers}
          dateLabel={dateLabel}
          busy={busy}
          onSave={saveDraft}
          onCancel={() => showPanel(null)}
          onUseEstimate={applyEstimate}
          onEditEstimate={(food, rowKey, previous) => setCreatingFood({ name: food.name, rowKey, unit: food.basis.unit, initialFood: food, previous })}
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
        <WorkoutDraftCard db={db} date={date} dateLabel={dateLabel} zone={deviceZone()} draft={panel.draft} onSaved={closeSavedLog} onCancel={() => showPanel(null)} />
      )}

      {panel?.kind === 'sleep' && (
        <SleepDraftCard db={db} date={date} dateLabel={dateLabel} zone={deviceZone()} bed={panel.bed} wake={panel.wake} asleepMin={panel.asleepMin} onSaved={closeSavedLog} onCancel={() => showPanel(null)} />
      )}

      {panel?.kind === 'answer' && (
        <AnswerCard nutrient={panel.nutrient} summary={summary} dateLabel={dateLabel} hideNumbers={hideNumbers} onDone={() => showPanel(null)} />
      )}

      {panel?.kind === 'note' && (
        <NoteCard text={panel.text} onAddManually={startManualDraft} onDone={() => showPanel(null)} />
      )}

      <DayTimeline db={db} dateLabel={dateLabel} meals={meals} workouts={workouts} sleeps={sleeps} foods={foods} hideNumbers={hideNumbers} diabetes={diabetes} weightKg={body?.weightKg ?? null} onOpenMeal={setOpenMealId} onChanged={reloadDay} />

      </div>
      <DaySidebar db={db} date={date} today={today} dateLabel={dateLabel} summary={summary} meals={meals} workouts={workouts} sleeps={sleeps} foods={foods} body={body} hideNumbers={hideNumbers} diabetes={diabetes} durability={durability} />
      </div>

      {openMeal !== undefined && (
        <MealSheet
          db={db}
          meal={openMeal}
          foods={foods}
          currentFoods={currentFoods}
          onClose={() => setOpenMealId(null)}
          onChanged={reloadDay}
          onLogAgain={() => logAgain(openMeal)}
        />
      )}

      {creatingFood !== null && (
        <FoodEditor
          previous={creatingFood.previous}
          initialFood={creatingFood.initialFood}
          initialName={creatingFood.name}
          initialUnit={creatingFood.unit}
          onClose={() => setCreatingFood(null)}
          onSave={(food) => saveCreatedFood(food, creatingFood.rowKey, creatingFood.initialFood !== undefined)}
        />
      )}
    </>
  );
}
