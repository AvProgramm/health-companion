import { useCallback, useEffect, useRef, useState } from 'react';
import { followToday } from '../../domain/shared/dates';
import type { SleepEntry } from '../../domain/sleep/sleep';
import type { WorkoutEntry } from '../../domain/training/workouts';
import { logsOn } from '../../storage/logsRepo';
import { mealsOn, type SavedMeal } from '../../storage/mealsRepo';
import { errorText } from '../format';
import type { Notice } from './useSave';

/**
 * Return the date on screen, what was logged on it, and a way to read it again.
 *
 * A failed read is reported through showNotice, so the day keeps what it last
 * showed instead of going blank. showNotice must not change between renders.
 */
export function useDiaryDay(db: IDBDatabase, today: string, showNotice: (notice: Notice) => void) {
  const [date, setDate] = useState(today);
  const [meals, setMeals] = useState<SavedMeal[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([]);
  const [sleeps, setSleeps] = useState<SleepEntry[]>([]);

  // Follow the device into a new day, unless an older day was picked on purpose
  const previousToday = useRef(today);
  useEffect(() => {
    // Read the old value now: React runs the updater later, after the ref below has moved on
    const before = previousToday.current;
    setDate((shown) => followToday(shown, before, today));
    previousToday.current = today;
  }, [today]);

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
      showNotice({ kind: 'error', text: errorText(problem) });
    }
  }, [db, date, showNotice]);

  useEffect(() => {
    reloadDay();
  }, [reloadDay]);

  return { date, setDate, meals, workouts, sleeps, reloadDay };
}
