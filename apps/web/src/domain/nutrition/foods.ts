import type { FoodVersion, NutrientKey, NutrientValue, SourceKind } from './types';
import { isUnit, type Quantity } from '../shared/units';
import { assertNonNegative, assertPositive } from '../shared/validate';

// Long names make rows unreadable on a phone and are almost always a paste mistake
const MAX_NAME_LENGTH = 80;

/**
 * What the food editor collects before it becomes a saved version.
 */
export interface FoodDraft {
  name: string;
  aliases: string[];
  basis: Quantity;
  nutrients: Partial<Record<NutrientKey, NutrientValue>>;
  sourceKind: SourceKind;
}

/**
 * Return a validated food version built from an editor draft.
 *
 * Editing never overwrites a label: it creates the next version, so meals saved
 * earlier keep the numbers they were saved with. A blank nutrient stays null.
 */
export function buildFoodVersion(draft: FoodDraft, newId: string, previous?: FoodVersion): FoodVersion {
  // Check the name
  const name = draft.name.trim();
  if (name === '') {
    throw new Error('Give the food a name');
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new Error(`Keep the name under ${MAX_NAME_LENGTH} characters`);
  }

  // Check the label basis, e.g. "per 250 mL"
  if (!isUnit(draft.basis.unit)) {
    throw new Error(`Unknown unit ${String(draft.basis.unit)}`);
  }
  assertPositive(draft.basis.amount, 'Label amount');

  // Check each nutrient the label gave; null means the label did not say
  const nutrients: FoodVersion['nutrients'] = {};
  for (const [key, value] of Object.entries(draft.nutrients) as [NutrientKey, NutrientValue | undefined][]) {
    if (value === undefined) {
      continue;
    }
    if (value !== null) {
      assertNonNegative(value, `Label ${key}`);
    }
    nutrients[key] = value;
  }

  // Keep each other name once, ignoring case, and never repeat the main name
  const seen = new Set([normaliseName(name)]);
  const aliases: string[] = [];
  for (const alias of draft.aliases.map((text) => text.trim()).filter((text) => text !== '')) {
    const key = normaliseName(alias);
    if (!seen.has(key)) {
      seen.add(key);
      aliases.push(alias);
    }
  }

  // Return the next version of the same food, or version 1 of a new one
  return {
    id: previous?.id ?? newId,
    version: previous === undefined ? 1 : previous.version + 1,
    name,
    aliases,
    basis: { amount: draft.basis.amount, unit: draft.basis.unit },
    nutrients,
    source: { kind: draft.sourceKind },
  };
}

/**
 * Return only the newest version of each food, sorted by name.
 */
export function latestVersions(foods: Iterable<FoodVersion>): FoodVersion[] {
  const newest = new Map<string, FoodVersion>();
  for (const food of foods) {
    const current = newest.get(food.id);
    if (current === undefined || food.version > current.version) {
      newest.set(food.id, food);
    }
  }
  return [...newest.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Return text lower-cased, without punctuation, with single spaces.
 */
export function normaliseName(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Return a simple singular form of each word ("biscuits" → "biscuit", "dishes" → "dish").
 *
 * Only plain English plurals are handled; anything unusual is left alone,
 * because a missed match just asks the user, while a wrong match would log the wrong food.
 */
function singular(text: string): string {
  return text
    .split(' ')
    .map((word) => {
      if (/(?:ches|shes|xes|sses)$/.test(word)) {
        return word.slice(0, -2);
      }
      if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) {
        return word.slice(0, -1);
      }
      return word;
    })
    .join(' ');
}

/**
 * Return every normalised name a food can be called by, in singular form.
 */
function nameKeys(food: FoodVersion): string[] {
  return [food.name, ...(food.aliases ?? [])].map((name) => singular(normaliseName(name)));
}

/**
 * Return the foods whose name or alias matches the text.
 *
 * An exact match wins. Otherwise a food matches if its whole name appears as
 * separate words inside the text ("full cream milk" finds "milk"), which is
 * only used when exactly one food fits.
 */
export function findFoods(text: string, foods: readonly FoodVersion[]): FoodVersion[] {
  const wanted = singular(normaliseName(text));
  if (wanted === '') {
    return [];
  }

  // Exact matches first
  const exact = foods.filter((food) => nameKeys(food).includes(wanted));
  if (exact.length > 0) {
    return exact;
  }

  // Then foods whose whole name appears as words inside the text
  const padded = ` ${wanted} `;
  return foods.filter((food) => nameKeys(food).some((key) => padded.includes(` ${key} `)));
}
