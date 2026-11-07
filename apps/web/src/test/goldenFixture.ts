/**
 * Read the golden ledger fixture into domain types, for tests only.
 *
 * The fixture is the independent reference: its expected totals were written
 * by hand in the build kit, not computed by this code.
 */
import goldenJson from '../../../../eval/fixtures/ledger_golden.json';
import { NUTRIENT_KEYS, type FoodVersion } from '../domain/nutrition/types';
import type { MealComponent } from '../domain/meals/types';
import { isUnit, type Unit } from '../domain/shared/units';

interface GoldenCase {
  id: string;
  op: string;
  items?: [string, number, string, number][];
  expect: Record<string, number | string | null>;
}

interface GoldenFile {
  products: Record<string, Record<string, unknown> & { basis: [number, string] }>;
  cases: GoldenCase[];
}

// The JSON's inferred type is a union per case, so it is read through one plain shape
const golden = goldenJson as unknown as GoldenFile;


/**
 * Return the fixture's unit text as a Unit; the fixture writes "pieces" for "piece".
 */
export function fixtureUnit(text: string): Unit {
  const unit = text === 'pieces' ? 'piece' : text;
  if (!isUnit(unit)) {
    throw new Error(`Unknown unit in fixture: ${text}`);
  }
  return unit;
}

/**
 * Return one golden case by its letter.
 */
export function goldenCase(id: string): GoldenCase {
  const found = golden.cases.find((item) => item.id === id);
  if (found === undefined) {
    throw new Error(`Golden case ${id} is missing`);
  }
  return found;
}

/**
 * Return one expected number from a golden case, failing loudly if it is not a number.
 */
export function expectedNumber(caseId: string, key: string): number {
  const value = goldenCase(caseId).expect[key];
  if (typeof value !== 'number') {
    throw new Error(`Golden case ${caseId} has no numeric ${key}`);
  }
  return value;
}

/**
 * Return every fixture product as a FoodVersion, keyed by product ID.
 */
export function fixtureFoods(): Map<string, FoodVersion> {
  const foods = new Map<string, FoodVersion>();
  for (const [id, product] of Object.entries(golden.products)) {
    // Copy only the nutrient keys the product actually lists
    const nutrients: FoodVersion['nutrients'] = {};
    for (const key of NUTRIENT_KEYS) {
      if (key in product) {
        nutrients[key] = product[key] as number | null;
      }
    }

    const [amount, unitText] = product.basis;
    foods.set(id, {
      id,
      version: 1,
      name: id,
      basis: { amount, unit: fixtureUnit(unitText) },
      nutrients,
      source: { kind: 'fixture', reference: 'eval/fixtures/ledger_golden.json' },
    });
  }
  return foods;
}

/**
 * Return the components of golden case A, using each product ID as the component ID.
 */
export function caseAComponents(): MealComponent[] {
  const items = goldenCase('A').items;
  if (items === undefined) {
    throw new Error('Golden case A is missing its items');
  }
  return items.map(([foodId, amount, unitText, eatenFraction]) => ({
    id: foodId,
    foodId,
    foodVersion: 1,
    served: { amount, unit: fixtureUnit(unitText) },
    eatenFraction,
    active: true,
  }));
}
