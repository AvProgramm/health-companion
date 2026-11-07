import { describe, expect, it } from 'vitest';
import { scaleNutrient } from './scale';
import { UnitMismatchError, type Quantity } from './units';

// Values copied from eval/fixtures/ledger_golden.json (fictional labels)
const MILK_BASIS: Quantity = { amount: 250, unit: 'mL' };
const BISCUIT_BASIS: Quantity = { amount: 2, unit: 'piece' };

describe('scaleNutrient', () => {
  it('scales milk energy from a 250 mL label to a 300 mL serving (golden A)', () => {
    expect(scaleNutrient(110.8, MILK_BASIS, { amount: 300, unit: 'mL' }, 1)).toBeCloseTo(132.96, 9);
  });

  it('scales milk protein the same way (golden A)', () => {
    expect(scaleNutrient(8.5, MILK_BASIS, { amount: 300, unit: 'mL' }, 1)).toBeCloseTo(10.2, 9);
  });

  it('applies the eaten fraction after scaling', () => {
    expect(scaleNutrient(133, BISCUIT_BASIS, { amount: 2, unit: 'piece' }, 0.5)).toBeCloseTo(66.5, 9);
  });

  it('converts a compatible unit before scaling', () => {
    expect(scaleNutrient(110.8, MILK_BASIS, { amount: 0.3, unit: 'L' }, 1)).toBeCloseTo(132.96, 9);
  });

  it('keeps an unknown nutrient unknown instead of returning 0', () => {
    expect(scaleNutrient(null, BISCUIT_BASIS, { amount: 2, unit: 'piece' }, 1)).toBeNull();
  });

  it('refuses to mix mass and volume without a density', () => {
    expect(() => scaleNutrient(110.8, MILK_BASIS, { amount: 300, unit: 'g' }, 1)).toThrow(UnitMismatchError);
  });

  it('rejects a zero or negative basis', () => {
    expect(() => scaleNutrient(110.8, { amount: 0, unit: 'mL' }, { amount: 300, unit: 'mL' }, 1)).toThrow(RangeError);
    expect(() => scaleNutrient(110.8, { amount: -250, unit: 'mL' }, { amount: 300, unit: 'mL' }, 1)).toThrow(RangeError);
  });

  it('rejects a negative serving and a negative nutrient value', () => {
    expect(() => scaleNutrient(110.8, MILK_BASIS, { amount: -1, unit: 'mL' }, 1)).toThrow(RangeError);
    expect(() => scaleNutrient(-5, MILK_BASIS, { amount: 300, unit: 'mL' }, 1)).toThrow(RangeError);
  });

  it('rejects an eaten fraction outside [0, 1]', () => {
    expect(() => scaleNutrient(110.8, MILK_BASIS, { amount: 300, unit: 'mL' }, 1.2)).toThrow(RangeError);
    expect(() => scaleNutrient(110.8, MILK_BASIS, { amount: 300, unit: 'mL' }, -0.1)).toThrow(RangeError);
  });

  // NaN fails every < and > comparison, so a range check alone would let it through
  it.each([NaN, Infinity, -Infinity])('rejects a non-finite eaten fraction (%s)', (fraction) => {
    expect(() => scaleNutrient(110.8, MILK_BASIS, { amount: 300, unit: 'mL' }, fraction)).toThrow(RangeError);
  });

  it('rejects non-finite amounts and nutrient values', () => {
    expect(() => scaleNutrient(110.8, MILK_BASIS, { amount: NaN, unit: 'mL' }, 1)).toThrow(RangeError);
    expect(() => scaleNutrient(110.8, { amount: Infinity, unit: 'mL' }, { amount: 300, unit: 'mL' }, 1)).toThrow(RangeError);
    expect(() => scaleNutrient(NaN, MILK_BASIS, { amount: 300, unit: 'mL' }, 1)).toThrow(RangeError);
  });

  it('still validates the serving when the nutrient is unknown', () => {
    expect(() => scaleNutrient(null, MILK_BASIS, { amount: -1, unit: 'mL' }, 1)).toThrow(RangeError);
  });

  it('does not round', () => {
    const result = scaleNutrient(10, { amount: 3, unit: 'g' }, { amount: 1, unit: 'g' }, 1);
    expect(result).not.toBe(3.33);
    expect(result).toBeCloseTo(10 / 3, 12);
  });
});
