import { describe, expect, it } from 'vitest';
import type { ProfileSnapshot } from './profile';
import { EMPTY_PROFILE } from './profile';
import { weightTrend } from './weightTrend';

/** Return a fictional saved version, with a weight unless it is null. */
function version(number: number, weightKg: number | null): ProfileSnapshot {
  const body = weightKg === null ? undefined : { heightCm: 175, weightKg, birthYear: null, sex: null, activity: null };
  return { id: 'local', version: number, operationKey: `key-${number}`, savedAt: `2026-11-0${number}T10:00:00Z`, value: { ...EMPTY_PROFILE, body } };
}

describe('weight trend', () => {
  it('keeps each change, oldest first, whatever order the versions arrive in', () => {
    expect(weightTrend([version(3, 69), version(1, 71), version(2, 70)]).map(point => point.weightKg)).toEqual([71, 70, 69]);
  });

  it('adds no point when another setting changed and the weight did not', () => {
    expect(weightTrend([version(1, 70), version(2, 70), version(3, 69)]).map(point => point.savedAt)).toEqual(['2026-11-01T10:00:00Z', '2026-11-03T10:00:00Z']);
  });

  it('skips versions saved before any weight was entered', () => {
    expect(weightTrend([version(1, null), version(2, 70)])).toHaveLength(1);
  });

  it('is empty when nothing was ever saved', () => {
    expect(weightTrend([])).toEqual([]);
  });
});
