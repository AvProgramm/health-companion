/**
 * One line per day across the three things this diary balances: food, training and sleep.
 *
 * Null means nothing was logged, which is not the same as zero: a day with no food
 * written down is a gap in the diary, not a day of fasting.
 */
import type { NutrientTotal } from '../nutrition/aggregate';
import type { DaySummary } from '../nutrition/day';
import { addDays } from '../shared/dates';
import type { SleepEntry } from '../sleep/sleep';
import type { WorkoutEntry } from '../training/workouts';

// A week, ending today
const DAYS_SHOWN = 7;

/** One day's food, training and sleep. */
export interface DayOverview {
  date: string;
  // Null when no meal was logged; a total with no known items is food of unknown energy
  energy: NutrientTotal | null;
  sessions: number;
  sleepMinutes: number | null;
}

/** Return the last seven dates, oldest first, ending today. */
export function lastSevenDates(today: string): string[] {
  return Array.from({ length: DAYS_SHOWN }, (_, index) => addDays(today, index - DAYS_SHOWN + 1));
}

/** Return one day's overview, leaving out deleted entries and skipped sessions. */
export function dayOverview(date: string, summary: DaySummary, workouts: readonly WorkoutEntry[], sleeps: readonly SleepEntry[]): DayOverview {
  const nights = sleeps.filter(entry => entry.deleted !== true);
  return {
    date,
    // Ignore the total of a day with no meals, because a gap in the diary is not zero
    energy: summary.coverage === 'no_entries' ? null : summary.totals.kcal,
    sessions: workouts.filter(entry => entry.deleted !== true && entry.status === 'done').length,
    // Use measured sleep where it was recorded, and time in bed otherwise
    sleepMinutes: nights.length === 0 ? null : nights.reduce((total, entry) => total + (entry.asleepMin ?? entry.timeInBedMin), 0),
  };
}
