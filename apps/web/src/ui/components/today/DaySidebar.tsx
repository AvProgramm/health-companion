import { ShieldCheck } from '@phosphor-icons/react';
import type { DaySummary } from '../../../domain/nutrition/day';
import type { FoodVersion } from '../../../domain/nutrition/types';
import type { BodyFacts } from '../../../domain/profile/body';
import type { SleepEntry } from '../../../domain/sleep/sleep';
import type { WorkoutEntry } from '../../../domain/training/workouts';
import type { SavedMeal } from '../../../storage/mealsRepo';
import type { Durability } from '../../../storage/persistence';
import { DURABILITY_TEXT } from '../../format';
import { BalanceCard } from '../summary/BalanceCard';
import { DaySummaryCard } from '../summary/DaySummaryCard';
import { WeekCard } from '../summary/WeekCard';

interface DaySidebarProps {
  db: IDBDatabase;
  date: string;
  today: string;
  dateLabel: string;
  summary: DaySummary;
  meals: readonly SavedMeal[];
  workouts: readonly WorkoutEntry[];
  sleeps: readonly SleepEntry[];
  foods: ReadonlyMap<string, FoodVersion>;
  body: BodyFacts | null;
  hideNumbers: boolean;
  diabetes: boolean;
  durability: Durability;
}

/**
 * Show the day's totals beside the diary, and how the diary is being kept.
 */
export function DaySidebar({ db, date, today, dateLabel, summary, meals, workouts, sleeps, foods, body, hideNumbers, diabetes, durability }: DaySidebarProps) {
  // Anything that changes what the day shows also makes the week read again
  const weekReloadKey = `${date}:${meals.length}:${workouts.length}:${sleeps.length}:${meals.map((meal) => meal.latest.revision).join()}`;

  return (
    <aside className="day-sidebar" aria-label="Daily overview">
      <DaySummaryCard diabetes={diabetes} summary={summary} dateLabel={dateLabel} hideNumbers={hideNumbers} />
      {!hideNumbers && summary.coverage === 'some_entries' && <BalanceCard summary={summary} workouts={workouts} body={body} currentYear={new Date().getFullYear()} />}
      {!hideNumbers && <WeekCard db={db} today={today} foods={foods} reloadKey={weekReloadKey} />}
      <div className="device-note"><ShieldCheck size={22} /><div><strong>Made for your everyday</strong><details><summary>Saved on this device</summary><p>{DURABILITY_TEXT[durability]}</p></details></div></div>
    </aside>
  );
}
