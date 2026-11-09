import { Leaf } from '@phosphor-icons/react';
import type { FoodVersion } from '../../../domain/nutrition/types';
import type { SleepEntry } from '../../../domain/sleep/sleep';
import type { WorkoutEntry } from '../../../domain/training/workouts';
import type { SavedMeal } from '../../../storage/mealsRepo';
import { MealCard } from '../meals/MealCard';
import { SleepCard } from '../sleep/SleepCard';
import { WorkoutCard } from '../training/WorkoutCard';

interface DayTimelineProps {
  db: IDBDatabase;
  dateLabel: string;
  meals: readonly SavedMeal[];
  workouts: readonly WorkoutEntry[];
  sleeps: readonly SleepEntry[];
  foods: ReadonlyMap<string, FoodVersion>;
  hideNumbers: boolean;
  diabetes: boolean;
  // Used only for on-device estimates; null means those stay unknown
  weightKg: number | null;
  onOpenMeal: (mealId: string) => void;
  onChanged: () => Promise<void>;
}

/**
 * Show what was logged on the day: sleep first, then meals, then training.
 */
export function DayTimeline({ db, dateLabel, meals, workouts, sleeps, foods, hideNumbers, diabetes, weightKg, onOpenMeal, onChanged }: DayTimelineProps) {
  return (
    <section className="timeline" aria-label={`Diary for ${dateLabel}`}>
      <div className="section-head"><h2 className="heading">Your diary</h2><span className="hint">{dateLabel}</span></div>
      {meals.length === 0 && workouts.length === 0 && sleeps.length === 0 && (
        <div className="diary-empty"><span className="empty-symbol"><Leaf size={32} /></span><h3 className="heading">Start with one small thing.</h3><p className="hint">A meal, a little movement, a good rest.<br />Your day comes together here.</p></div>
      )}
      {sleeps.map((entry) => (
        <SleepCard key={entry.id} db={db} entry={entry} onChanged={onChanged} />
      ))}
      {meals.map((meal) => (
        <MealCard diabetes={diabetes} key={meal.header.mealId} meal={meal} foods={foods} hideNumbers={hideNumbers} onOpen={() => onOpenMeal(meal.header.mealId)} />
      ))}
      {workouts.map((entry) => (
        <WorkoutCard key={entry.id} db={db} entry={entry} weightKg={weightKg} hideNumbers={hideNumbers} onChanged={onChanged} />
      ))}
    </section>
  );
}
