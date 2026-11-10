import { foodKey } from '../../domain/nutrition/aggregate';
import { summariseDay } from '../../domain/nutrition/day';
import type { FoodVersion } from '../../domain/nutrition/types';
import type { SleepEntry } from '../../domain/sleep/sleep';
import type { WorkoutEntry } from '../../domain/training/workouts';
import { weekLines } from '../../domain/week/weekLines';
import { dayOverview, lastSevenDates } from '../../domain/week/weekOverview';
import { logsOn } from '../../data/storage/logsRepo';
import { mealsOn } from '../../data/storage/mealsRepo';

/**
 * Return the last seven days as plain lines for the AI, read from this device's diary.
 *
 * Only called when the person has switched sharing on. Deleted meals and removed items
 * are left out, so a correction is never read back as something eaten.
 */
export async function loadWeekLines(db: IDBDatabase, today: string, foods: ReadonlyMap<string, FoodVersion>): Promise<string[]> {
  const foodNames = new Map<string, string[]>();
  const days = await Promise.all(lastSevenDates(today).map(async (date) => {
    const [meals, workouts, sleeps] = await Promise.all([mealsOn(db, date), logsOn<WorkoutEntry>(db, 'workouts', date), logsOn<SleepEntry>(db, 'sleep', date)]);
    const latest = meals.map((meal) => meal.latest);

    // Name each food still counted on this day
    foodNames.set(date, latest.filter((meal) => meal.deleted !== true).flatMap((meal) => meal.components.filter((component) => component.active))
      .map((component) => foods.get(foodKey(component.foodId, component.foodVersion))?.name).filter((name): name is string => name !== undefined));
    return dayOverview(date, summariseDay(date, latest, foods), workouts, sleeps);
  }));
  return weekLines(days, foodNames);
}
