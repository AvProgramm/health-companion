import { describe, expect, it } from 'vitest';
import { readEstimate, estimatedFood } from './estimates';
import { summariseDay } from './day';
import { startMeal } from '../meals/revisions';
import { foodKey } from './aggregate';
import { formatTotal } from '../../ui/format';

// These values describe a fictional food, never a diary entry.
const proposal = {
  basis: { amount: 50, unit: 'g' },
  nutrients: { kcal: 60, protein_g: null, fat_g: null, satfat_g: null, total_sugar_g: null, added_sugar_g: null },
  range: { kcal: { low: 50, high: 70 }, protein_g: null, fat_g: null, satfat_g: null, total_sugar_g: null, added_sugar_g: null },
  sourceKind: 'database', reason: 'Two fictional matches.',
  sources: [{ provider: 'USDA', description: 'Fictional oats', url: 'https://example.org/food' }],
};

describe('estimate boundary and totals', () => {
  it('scales ranges through meal corrections and day totals without rounding', () => {
    const food = estimatedFood('Fictional oats', readEstimate(proposal), 'fictional');
    const meal = startMeal({ mealId: 'meal', operationKey: 'save', localDate: '2026-11-09', zone: 'Asia/Kuala_Lumpur', savedAt: '2026-11-09T10:00:00Z',
      components: [{ id: 'item', foodId: food.id, foodVersion: 1, served: { amount: 100, unit: 'g' }, eatenFraction: 0.5, active: true }] });
    const day = summariseDay('2026-11-09', [meal], new Map([[foodKey(food.id, 1), food]]));
    expect(day.totals.kcal.known).toBeCloseTo(60, 9);
    expect(day.totals.kcal.range).toEqual({ low: 50, high: 70 });
    expect(day.totals.protein_g).toEqual({ known: 0, knownItems: 0, unknownItems: 1 });
    // Seen on 7 Nov: a nutrient nothing gave a value for read "0.0 g known + 2 unknown"
    expect(formatTotal(day.totals.protein_g, 'g')).toBe('unknown (1 item without a value)');
    expect(formatTotal(day.totals.kcal, 'kcal')).toBe('≈ 60.0 kcal (50.0–70.0)');
    expect(food.source.reference).toContain('USDA');
  });

  // Added 7 Nov with carbohydrate, fibre, sodium and unsaturated fat: a service from
  // before those existed sends six nutrients, and the rest must read as unknown, never 0
  it('treats a nutrient the service did not send as unknown', () => {
    const estimate = readEstimate(proposal);
    expect(estimate.nutrients.kcal).toBe(60);
    expect(estimate.nutrients.carbs_g).toBeNull();
    expect(estimate.nutrients.sodium_mg).toBeNull();
    expect(estimate.range.fibre_g).toBeNull();
  });

  it('rejects missing, non-finite, negative, unsupported, unsafe-source and inconsistent proposals', () => {
    for (const invalid of [
      {}, { ...proposal, nutrients: {} },
      { ...proposal, range: { ...proposal.range, iron_mg: null } },
      { ...proposal, nutrients: { ...proposal.nutrients, kcal: -1 } },
      { ...proposal, nutrients: { ...proposal.nutrients, kcal: Number.NaN } },
      { ...proposal, range: { ...proposal.range, kcal: { low: 70, high: 80 } } },
      { ...proposal, sources: [{ provider: 'USDA', description: 'bad', url: 'javascript:alert(1)' }] },
    ]) expect(() => readEstimate(invalid)).toThrow();
  });
});

describe('empty nutrition proposals', () => {
  it('rejects all unknown values while allowing a real zero value', () => {
    // Reported from the phone on 7 Nov: nasi lemak, with no portion typed.
    expect(() => readEstimate({ ...proposal,
      nutrients: Object.fromEntries(Object.keys(proposal.nutrients).map((key) => [key, null])),
      range: Object.fromEntries(Object.keys(proposal.range).map((key) => [key, null])),
    })).toThrow('No nutrition values');
    expect(readEstimate({ ...proposal, nutrients: { ...proposal.nutrients, kcal: 0 }, range: { ...proposal.range, kcal: { low: 0, high: 0 } } }).nutrients.kcal).toBe(0);
  });
});

it('accepts explicit web supplementation with its own provenance badge', () => {
  expect(readEstimate({ ...proposal, sourceKind: 'web_estimate' }).sourceKind).toBe('web_estimate');
});
