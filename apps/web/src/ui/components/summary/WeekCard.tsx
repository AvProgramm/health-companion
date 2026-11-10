import { useEffect, useState } from 'react';
import { summariseDay } from '../../../domain/nutrition/day';
import type { FoodVersion } from '../../../domain/nutrition/types';
import type { SleepEntry } from '../../../domain/sleep/sleep';
import type { WorkoutEntry } from '../../../domain/training/workouts';
import { dayOverview, lastSevenDates, type DayOverview } from '../../../domain/week/weekOverview';
import { logsOn } from '../../../data/storage/logsRepo';
import { mealsOn } from '../../../data/storage/mealsRepo';
import { formatEnergyCell, formatSleepCell, formatTotal } from '../../format';

// The short name of each day, read from the date alone so the device's zone cannot shift it
const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' });

interface WeekCardProps {
  db: IDBDatabase;
  today: string;
  foods: ReadonlyMap<string, FoodVersion>;
  // Changes whenever today's entries change, so the week reloads with them
  reloadKey: string;
}

/**
 * Show the last seven days of food, training and sleep side by side.
 *
 * A gap stays a gap: a day with nothing logged shows a dash, never a zero.
 */
export function WeekCard({ db, today, foods, reloadKey }: WeekCardProps) {
  const [days, setDays] = useState<DayOverview[] | null>(null);

  // Read each day's records, leaving the card out quietly if the diary cannot be read
  useEffect(() => {
    let cancelled = false;
    Promise.all(lastSevenDates(today).map(async date => {
      const [meals, workouts, sleeps] = await Promise.all([mealsOn(db, date), logsOn<WorkoutEntry>(db, 'workouts', date), logsOn<SleepEntry>(db, 'sleep', date)]);
      return dayOverview(date, summariseDay(date, meals.map(meal => meal.latest), foods), workouts, sleeps);
    })).then(loaded => { if (!cancelled) setDays(loaded); }, () => { if (!cancelled) setDays(null); });
    return () => { cancelled = true; };
  }, [db, today, foods, reloadKey]);

  if (days === null) return null;
  const highest = Math.max(1, ...days.map(day => day.energy?.known ?? 0));

  return (
    <section className="card week-card" aria-labelledby="week-heading">
      <div><p className="eyebrow">THE LAST SEVEN DAYS</p><h2 id="week-heading" className="heading">Your week</h2></div>
      <div className="week-grid" role="table" aria-label="Food, training and sleep for the last seven days">
        {days.map(day => <div key={day.date} className={`week-day${day.date === today ? ' week-today' : ''}`} role="row">
          <span className="hint" role="cell">{WEEKDAY.format(new Date(`${day.date}T00:00:00Z`))}</span>
          <span className="week-bar" role="cell" aria-label={day.energy === null ? 'No food logged' : formatTotal(day.energy, 'kcal', 0)}>{day.energy !== null && <i style={{ height: `${(day.energy.known / highest) * 100}%` }} />}</span>
          <span className="numbers" role="cell">{formatEnergyCell(day.energy)}</span>
          <span className="numbers" role="cell" aria-label={`${day.sessions} training sessions`}>{day.sessions > 0 ? `${day.sessions}×` : '–'}</span>
          <span className="numbers" role="cell" aria-label="Hours of sleep">{formatSleepCell(day.sleepMinutes)}</span>
        </div>)}
      </div>
      <p className="hint">Each column is a day: energy eaten in kcal, training sessions, sleep. – nothing logged · ? food with no energy value · + at least this, some items had no value · ≈ includes estimates.</p>
    </section>
  );
}
