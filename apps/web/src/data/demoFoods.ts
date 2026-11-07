import type { FoodVersion } from '../domain/types';

// Fictional labels copied from eval/fixtures/ledger_golden.json, used until
// real saved foods arrive in Milestone 2. demoFoods.test.ts keeps them in sync.
const FIXTURE_REFERENCE = 'eval/fixtures/ledger_golden.json';

export const DEMO_MILK: FoodVersion = {
  id: 'demo_milk',
  version: 1,
  name: 'Milk (demo label)',
  basis: { amount: 250, unit: 'mL' },
  nutrients: {
    kcal: 110.8,
    protein_g: 8.5,
    fat_g: 3.8,
    satfat_g: 2.5,
    total_sugar_g: 10.8,
    added_sugar_g: 0,
  },
  source: { kind: 'fixture', reference: FIXTURE_REFERENCE },
};

export const DEMO_BISCUIT: FoodVersion = {
  id: 'demo_biscuit',
  version: 1,
  name: 'Wheat biscuit (demo label)',
  basis: { amount: 2, unit: 'piece' },
  nutrients: {
    kcal: 133,
    protein_g: 4.1,
    added_sugar_g: null,
  },
  source: { kind: 'fixture', reference: FIXTURE_REFERENCE },
};
