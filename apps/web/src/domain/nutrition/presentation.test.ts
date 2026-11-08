import { expect, it } from 'vitest';
import { nutrientOrder } from './presentation';

it('promotes diabetes display priorities without hiding or duplicating any nutrient', () => {
  const keys = ['kcal', 'protein_g', 'fibre_g', 'carbs_g', 'fat_g', 'added_sugar_g'] as const;
  expect(nutrientOrder(keys, false)).toEqual(keys);
  expect(nutrientOrder(keys, true)).toEqual(['carbs_g', 'added_sugar_g', 'fibre_g', 'kcal', 'protein_g', 'fat_g']);
});
