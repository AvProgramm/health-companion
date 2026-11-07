import { describe, expect, it } from 'vitest';
import { areCompatible, convertQuantity, isUnit, UnitMismatchError } from './units';

describe('convertQuantity', () => {
  it('converts litres to millilitres and back', () => {
    expect(convertQuantity({ amount: 0.25, unit: 'L' }, 'mL')).toEqual({ amount: 250, unit: 'mL' });
    expect(convertQuantity({ amount: 300, unit: 'mL' }, 'L').amount).toBeCloseTo(0.3, 12);
  });

  it('converts kilograms to grams', () => {
    expect(convertQuantity({ amount: 1.5, unit: 'kg' }, 'g')).toEqual({ amount: 1500, unit: 'g' });
  });

  it('returns the same amount when the unit already matches', () => {
    expect(convertQuantity({ amount: 2, unit: 'piece' }, 'piece')).toEqual({ amount: 2, unit: 'piece' });
  });

  // Every cross-dimension pair must refuse, because a density would have to be guessed
  it.each([
    ['g', 'mL'],
    ['mL', 'g'],
    ['kg', 'L'],
    ['piece', 'g'],
    ['mL', 'piece'],
  ] as const)('refuses to convert %s to %s', (from, to) => {
    expect(() => convertQuantity({ amount: 1, unit: from }, to)).toThrow(UnitMismatchError);
    expect(areCompatible(from, to)).toBe(false);
  });
});

describe('isUnit', () => {
  it('accepts known units and rejects anything else', () => {
    expect(isUnit('mL')).toBe(true);
    expect(isUnit('ml')).toBe(false);
    expect(isUnit('cup')).toBe(false);
    expect(isUnit(250)).toBe(false);
    // Inherited object keys must not count as units
    expect(isUnit('toString')).toBe(false);
  });
});
