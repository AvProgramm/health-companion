import { describe, expect, it } from 'vitest';
import type { DaySummary } from '../nutrition/day';
import type { SleepEntry } from '../sleep/sleep';
import type { WorkoutEntry } from '../training/workouts';
import { dayOverview, lastSevenDates } from './weekOverview';

/** Return a fictional day's food summary with this energy total. */
function food(known: number, knownItems: number, unknownItems = 0): DaySummary {
  return { date: '2026-11-09', mealCount: 1, coverage: 'some_entries', totals: { kcal: { known, knownItems, unknownItems } } as DaySummary['totals'] };
}

/** Return a fictional workout. */
function workout(changes: Partial<WorkoutEntry> = {}): WorkoutEntry {
  return { id: 'w', localDate: '2026-11-09', zone: 'UTC', savedAt: '2026-11-09T10:00:00Z', operationKey: 'k', movement: 'Run', movementKey: 'run', status: 'done', sets: [], version: 1, ...changes };
}

/** Return a fictional night of sleep. */
function night(changes: Partial<SleepEntry> = {}): SleepEntry {
  return { timeInBedMin: 450, asleepMin: null, ...changes } as SleepEntry;
}

describe('the last seven dates', () => {
  it('ends today and crosses a month correctly', () => {
    expect(lastSevenDates('2026-11-03')).toEqual(['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03']);
  });
});

describe('one day of the overview', () => {
  it('reports known energy and items with no value', () => {
    expect(dayOverview('2026-11-09', food(1500, 3, 2), [], [])).toMatchObject({ kcal: 1500, unknownItems: 2 });
  });

  it('keeps a day with no energy values unknown rather than zero', () => {
    expect(dayOverview('2026-11-09', food(0, 0), [], []).kcal).toBeNull();
  });

  it('counts only sessions that happened and still exist', () => {
    expect(dayOverview('2026-11-09', food(0, 0), [workout(), workout({ status: 'skipped' }), workout({ deleted: true })], []).sessions).toBe(1);
  });

  it('keeps a night with nothing logged unknown rather than zero', () => {
    expect(dayOverview('2026-11-09', food(0, 0), [], []).sleepMinutes).toBeNull();
  });

  it('uses measured sleep when recorded, and time in bed otherwise', () => {
    expect(dayOverview('2026-11-09', food(0, 0), [], [night({ asleepMin: 400 })]).sleepMinutes).toBe(400);
    expect(dayOverview('2026-11-09', food(0, 0), [], [night()]).sleepMinutes).toBe(450);
  });

  it('leaves out a deleted night', () => {
    expect(dayOverview('2026-11-09', food(0, 0), [], [night({ deleted: true })]).sleepMinutes).toBeNull();
  });
});
