import { describe, expect, it } from 'vitest';
import { burnOfDay, cardioBurn } from './cardio';
import type { WorkoutEntry, WorkoutSet } from './workouts';

/** Return one timed set. */
function timed(minutes: number | null, distanceKm: number | null): WorkoutSet {
  return { reps: null, load: null, loadUnit: null, perHand: false, minutes, distanceKm };
}

/** Return a fictional session of one movement. */
function session(movement: string, sets: WorkoutSet[], status: WorkoutEntry['status'] = 'done') {
  return { movement, status, sets };
}

// A treadmill screen read on 9 Nov: 13:40, 1.551 km, 6.81 km/h, 125.3 kcal
const TREADMILL_MINUTES = 13 + 40 / 60;
const TREADMILL_KM = 1.551;

describe('cardio energy', () => {
  it('reproduces the treadmill screen with its default 70 kg and the running equation', () => {
    // 1551 m / 13.667 min = 113.49 m/min; (0.2 x 113.49 + 3.5) x 70 / 1000 x 5 x 13.667
    const estimate = cardioBurn(session('Run', [timed(TREADMILL_MINUTES, TREADMILL_KM)]), 70)!;
    expect((estimate.low + estimate.high) / 2).toBeCloseTo(125.31, 1);
  });

  it('reports both equations for a treadmill at an in-between speed', () => {
    const estimate = cardioBurn(session('Treadmill', [timed(TREADMILL_MINUTES, TREADMILL_KM)]), 70)!;
    // Walking equation: (0.1 x 113.49 + 3.5) x 70 / 1000 x 5 x 13.667
    expect(estimate.low).toBeCloseTo(71.03, 1);
    expect(estimate.high).toBeCloseTo(125.31, 1);
  });

  it('uses the walking equation for a slow treadmill and the running one for a fast treadmill', () => {
    // 5 km/h for 60 min at 60 kg: (0.1 x 83.33 + 3.5) x 60 / 1000 x 5 x 60 = 213
    const slow = cardioBurn(session('Treadmill', [timed(60, 5)]), 60)!;
    expect((slow.low + slow.high) / 2).toBeCloseTo(213, 0);
    // 10 km/h for 60 min at 60 kg: (0.2 x 166.67 + 3.5) x 60 / 1000 x 5 x 60 = 663
    const fast = cardioBurn(session('Treadmill', [timed(60, 10)]), 60)!;
    expect((fast.low + fast.high) / 2).toBeCloseTo(663, 0);
  });

  it('always gives a range around one equation', () => {
    const estimate = cardioBurn(session('Walk', [timed(60, 5)]), 60)!;
    expect(estimate.high).toBeGreaterThan(estimate.low);
  });

  it('adds up several sets', () => {
    const one = cardioBurn(session('Run', [timed(10, 2)]), 70)!;
    const two = cardioBurn(session('Run', [timed(10, 2), timed(10, 2)]), 70)!;
    expect(two.low).toBeCloseTo(one.low * 2, 9);
  });

  it.each([
    ['no body weight', session('Run', [timed(30, 5)]), null],
    ['no distance', session('Run', [timed(30, null)]), 70],
    ['no time', session('Run', [timed(null, 5)]), 70],
    ['an activity the equations do not cover', session('Cycle', [timed(30, 10)]), 70],
    ['gym sets', session('Row', [{ ...timed(null, null), reps: 8 }]), 70],
    ['a skipped day', session('Run', [], 'skipped'), 70],
  ])('stays unknown with %s', (_label, entry, weight) => {
    expect(cardioBurn(entry as ReturnType<typeof session>, weight as number | null)).toBeNull();
  });

  it('stays unknown if any one set cannot be worked out', () => {
    expect(cardioBurn(session('Run', [timed(10, 2), timed(10, null)]), 70)).toBeNull();
  });
});

describe('a whole day', () => {
  /** Return a saved fictional entry. */
  function saved(movement: string, sets: WorkoutSet[], changes: Partial<WorkoutEntry> = {}): WorkoutEntry {
    return { id: movement, localDate: '2026-11-09', zone: 'Asia/Kuala_Lumpur', savedAt: '2026-11-09T10:00:00Z', operationKey: movement, movement, movementKey: movement, status: 'done', sets, version: 1, ...changes };
  }

  it('adds the sessions it can estimate and counts the ones it cannot', () => {
    const one = cardioBurn(saved('Run', [timed(10, 2)]), 70)!;
    const day = burnOfDay([saved('Run', [timed(10, 2)]), saved('Walk2', [timed(10, null)]), saved('Row', [{ ...timed(null, null), reps: 8 }])], 70)!;
    expect(day.low).toBeCloseTo(one.low, 9);
    expect(day.unknownSessions).toBe(2);
  });

  it('leaves out deleted sessions and skipped days', () => {
    const day = burnOfDay([saved('Run', [timed(10, 2)]), saved('Run again', [timed(10, 2)], { deleted: true }), saved('Rest', [], { status: 'skipped' })], 70)!;
    expect(day.unknownSessions).toBe(0);
    expect(day.low).toBeCloseTo(cardioBurn(saved('Run', [timed(10, 2)]), 70)!.low, 9);
  });

  it('stays unknown with no estimate at all, rather than claiming zero', () => {
    expect(burnOfDay([saved('Cycle', [timed(30, 10)])], 70)).toBeNull();
    expect(burnOfDay([], 70)).toBeNull();
    expect(burnOfDay([saved('Run', [timed(10, 2)])], null)).toBeNull();
  });
});
