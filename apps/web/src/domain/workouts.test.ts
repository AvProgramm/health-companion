import { describe, expect, it } from 'vitest';
import { buildWorkout, describeSets, lastPerformed, movementKey, type WorkoutEntry, type WorkoutSet } from './workouts';

// One set of 8 reps at 5 kg in each hand
const ROW_SET: WorkoutSet = { reps: 8, load: 5, loadUnit: 'kg', perHand: true, minutes: null, distanceKm: null };

// Build a saved entry with fixed IDs and times
function entry(movement: string, localDate: string, sets: WorkoutSet[], status: 'done' | 'skipped' = 'done'): WorkoutEntry {
  return buildWorkout(
    { movement, status, sets },
    { id: `${movement}-${localDate}`, operationKey: `op-${movement}-${localDate}`, localDate, zone: 'Asia/Kuala_Lumpur', savedAt: `${localDate}T18:00:00+08:00` },
  );
}

describe('buildWorkout and describeSets', () => {
  it('shows three sets at 5 kg each hand, not 15 kg (kit Tuesday test 2)', () => {
    const rows = entry('Row', '2026-11-10', [ROW_SET, ROW_SET, ROW_SET]);
    expect(rows.sets).toHaveLength(3);
    expect(describeSets(rows)).toBe('3 × 8 @ 5 kg each hand');
  });

  it('writes a timed activity with distance', () => {
    const run = entry('Run', '2026-11-10', [{ reps: null, load: null, loadUnit: null, perHand: false, minutes: 30, distanceKm: 5 }]);
    expect(describeSets(run)).toBe('30 min · 5 km');
  });

  it('keeps no sets for a skipped day', () => {
    const skipped = entry('Gym', '2026-11-10', [ROW_SET], 'skipped');
    expect(skipped.sets).toEqual([]);
    expect(describeSets(skipped)).toBe('Skipped');
  });

  it('rejects a set with no reps or time, a load with no unit, and non-finite numbers', () => {
    expect(() => entry('Row', '2026-11-10', [{ ...ROW_SET, reps: null }])).toThrow(/reps or a time/);
    expect(() => entry('Row', '2026-11-10', [{ ...ROW_SET, loadUnit: null }])).toThrow(/kg or lb/);
    expect(() => entry('Row', '2026-11-10', [{ ...ROW_SET, reps: 8.5 }])).toThrow(RangeError);
    expect(() => entry('Row', '2026-11-10', [{ ...ROW_SET, load: Number.NaN }])).toThrow(RangeError);
    expect(() => entry('Row', '2026-11-10', [])).toThrow(RangeError);
  });
});

describe('lastPerformed', () => {
  it('returns the latest session that actually happened', () => {
    const older = entry('Rows', '2026-11-08', [ROW_SET]);
    const newer = entry('row', '2026-11-10', [{ ...ROW_SET, load: 6 }]);
    const skipped = entry('Row', '2026-11-11', [], 'skipped');
    const deleted = { ...entry('Row', '2026-11-12', [ROW_SET]), deleted: true };
    expect(lastPerformed([older, newer, skipped, deleted], movementKey('ROWS'))?.sets[0]?.load).toBe(6);
  });

  it('returns undefined for a movement never done', () => {
    expect(lastPerformed([], 'squat')).toBeUndefined();
  });
});
