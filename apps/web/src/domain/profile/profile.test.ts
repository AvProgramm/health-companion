import { expect, it } from 'vitest';
import { EMPTY_PROFILE, assertProfile, assertProfileSnapshot } from './profile';

it('starts without inferred limitations or conditions', () => {
  expect(EMPTY_PROFILE).toEqual({ avoidAreas: [], seatedOnly: false, unableTo: [], diabetes: false });
});

it('rejects unknown facts, non-booleans, duplicates and extra profile fields', () => {
  for (const value of [{ ...EMPTY_PROFILE, avoidAreas: ['unknown'] }, { ...EMPTY_PROFILE, seatedOnly: 'yes' },
    { ...EMPTY_PROFILE, unableTo: ['jumping', 'jumping'] }, { ...EMPTY_PROFILE, note: 'Fictional private note' }]) {
    expect(() => assertProfile(value)).toThrow();
  }
});

it('validates every snapshot field before a restore can write it', () => {
  const snapshot = { id: 'local', version: 1, operationKey: 'fictional-save', savedAt: '2026-11-08T10:00:00Z', value: EMPTY_PROFILE };
  expect(() => assertProfileSnapshot(snapshot)).not.toThrow();
  for (const field of [{ version: Number.NaN }, { version: 0 }, { operationKey: '' }, { id: 'someone-else' }, { savedAt: 'invalid' }, { value: null }]) {
    expect(() => assertProfileSnapshot({ ...snapshot, ...field })).toThrow();
  }
});
