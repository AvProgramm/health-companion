import { describe, expect, it } from 'vitest';
import { buildFoodVersion, findFoods, latestVersions, type FoodDraft } from './foods';
import { COFFEE, MILK, RICE, WEETABIX } from '../../test/testFoods';

const DRAFT: FoodDraft = {
  name: '  Milo powder ',
  aliases: ['milo', 'Milo', ' ', 'MILO POWDER'],
  basis: { amount: 30, unit: 'g' },
  nutrients: { kcal: 120, protein_g: 3, added_sugar_g: null },
  sourceKind: 'label',
};

describe('buildFoodVersion', () => {
  it('creates version 1 with a trimmed name and de-duplicated aliases', () => {
    const food = buildFoodVersion(DRAFT, 'milo');
    expect(food).toMatchObject({ id: 'milo', version: 1, name: 'Milo powder', aliases: ['milo'] });
    // A blank label value stays unknown
    expect(food.nutrients.added_sugar_g).toBeNull();
  });

  it('creates the next version when editing, keeping the same ID', () => {
    const first = buildFoodVersion(DRAFT, 'milo');
    const second = buildFoodVersion({ ...DRAFT, nutrients: { kcal: 118 } }, 'ignored-new-id', first);
    expect(second).toMatchObject({ id: 'milo', version: 2 });
    expect(second.nutrients).toEqual({ kcal: 118 });
  });

  it('rejects an empty name, a zero basis and non-finite or negative nutrients', () => {
    expect(() => buildFoodVersion({ ...DRAFT, name: ' ' }, 'x')).toThrow(/name/);
    expect(() => buildFoodVersion({ ...DRAFT, basis: { amount: 0, unit: 'g' } }, 'x')).toThrow(RangeError);
    expect(() => buildFoodVersion({ ...DRAFT, nutrients: { kcal: NaN } }, 'x')).toThrow(RangeError);
    expect(() => buildFoodVersion({ ...DRAFT, nutrients: { kcal: -1 } }, 'x')).toThrow(RangeError);
  });
});

describe('latestVersions', () => {
  it('keeps only the newest version of each food', () => {
    const v2 = { ...MILK, version: 2, name: 'Milk v2' };
    expect(latestVersions([MILK, v2, RICE]).map((food) => `${food.id}@${food.version}`)).toEqual(['rice@1', 'demo_milk@2']);
  });
});

describe('findFoods', () => {
  const foods = [MILK, WEETABIX, COFFEE, RICE];

  it('matches names and aliases regardless of case and plurals', () => {
    expect(findFoods('WEETABIX', foods)).toEqual([WEETABIX]);
    expect(findFoods('wheat biscuits', foods)).toEqual([WEETABIX]);
    expect(findFoods('coffee', foods)).toEqual([COFFEE]);
  });

  it('finds a food whose name appears inside longer text', () => {
    expect(findFoods('cold milk', foods)).toEqual([MILK]);
  });

  it('returns nothing for an unknown name', () => {
    expect(findFoods('gravy', foods)).toEqual([]);
  });
});
