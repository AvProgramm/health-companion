import { buildFoodVersion } from './foods';
import { NUTRIENT_KEYS } from './types';
import type { FoodVersion, NutrientKey, NutrientRange } from './types';
import type { Quantity } from '../shared/units';

/** Describe a validated proposal without assigning storage IDs. */
export interface NutritionEstimate {
  basis: Quantity;
  nutrients: FoodVersion['nutrients'];
  range: Partial<Record<NutrientKey, NutrientRange | null>>;
  sourceKind: 'database' | 'ai_estimate' | 'web_estimate';
  reason: string;
  sources: { provider: string; description: string; url: string }[];
}

/** Return whether an external value is a plain object. */
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Return whether a nutrient is finite and non-negative. */
function nonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Reject malformed nutrient ranges before storage or display. */
export function validateRanges(nutrients: FoodVersion['nutrients'], range: unknown): void {
  if (!record(range)) throw new Error('Return nutrient ranges as an object.');
  for (const [key, spread] of Object.entries(range)) {
    if (!NUTRIENT_KEYS.includes(key as NutrientKey)) throw new Error('Return only supported nutrient ranges.');
    const value = nutrients[key as NutrientKey] ?? null;
    if (spread === null && value === null) continue;
    if (!record(spread) || !nonNegative(spread.low) || !nonNegative(spread.high) || value === null || spread.low > value || spread.high < value) {
      throw new Error('Keep each known nutrient inside its non-negative range.');
    }
  }
}

/** Return a checked estimate from an untrusted service response. */
export function readEstimate(value: unknown): NutritionEstimate {
  if (!record(value) || !record(value.basis) || !record(value.nutrients) || !record(value.range) ||
      !['database', 'ai_estimate', 'web_estimate'].includes(String(value.sourceKind)) ||
      typeof value.reason !== 'string' || value.reason.length === 0 || value.reason.length > 500 ||
      !Array.isArray(value.sources) || value.sources.length === 0 || value.sources.length > 12) {
    throw new Error('The estimate is incomplete. Edit this food manually.');
  }
  // A nutrient the service did not send is unknown, as on a saved label, so a service
  // from before a nutrient was added still works; a value that is sent must be valid
  const nutrients: Record<string, unknown> = {};
  const range: Record<string, unknown> = {};
  for (const key of NUTRIENT_KEYS) {
    const nutrient = value.nutrients[key] ?? null;
    if (nutrient !== null && !nonNegative(nutrient)) throw new Error('Return each nutrient as a number or null.');
    nutrients[key] = nutrient;
    range[key] = value.range[key] ?? null;
  }
  for (const key of Object.keys(value.range)) {
    if (!NUTRIENT_KEYS.includes(key as NutrientKey)) throw new Error('Return only supported nutrient ranges.');
  }
  if (NUTRIENT_KEYS.every((key) => nutrients[key] === null)) {
    throw new Error('No nutrition values were returned. Try a clearer portion or add the food manually.');
  }
  for (const source of value.sources) {
    if (!record(source) || typeof source.provider !== 'string' || source.provider.length === 0 ||
        typeof source.description !== 'string' || typeof source.url !== 'string' || !source.url.startsWith('https://')) {
      throw new Error('Return the sources used for this estimate.');
    }
  }
  // Reuse label validation for the portion and all finite nutrient values.
  const proposal = { ...value, nutrients, range } as unknown as NutritionEstimate;
  buildFoodVersion({ name: 'Estimate', aliases: [], basis: proposal.basis, nutrients: proposal.nutrients, sourceKind: proposal.sourceKind }, 'validation');
  validateRanges(proposal.nutrients, proposal.range);
  return proposal;
}

// One named container, as in "1 cup" or "a bowl"; a measured portion like "150 g" never matches
const ONE_CONTAINER = /^(?:1|a|one)\s+([a-z]+)$/i;

// Words that are already units or plain servings, so they name no container
const NOT_CONTAINERS = new Set(['g', 'kg', 'ml', 'l', 'piece', 'pieces', 'serving']);

/**
 * Return the other name a one-serving estimate is known by, such as "cup of coffee".
 *
 * A model asked about "1 cup" answers for one serving (a piece), so without this the
 * diary later asks "How much was the cup?" for the very cup it estimated.
 */
function containerAliases(name: string, basis: Quantity, portionText: string): string[] {
  const container = ONE_CONTAINER.exec(portionText.trim())?.[1]?.toLowerCase();
  // Ignore anything but one serving of one named container, because only that is what the estimate describes
  if (container === undefined || NOT_CONTAINERS.has(container) || basis.unit !== 'piece' || basis.amount !== 1) {
    return [];
  }
  return [`${container} of ${name.trim().toLowerCase()}`];
}

/** Return a food version only when the user accepts a checked proposal. */
export function estimatedFood(name: string, estimate: NutritionEstimate, id: string, portionText = ''): FoodVersion {
  const checked = readEstimate(estimate);
  const aliases = containerAliases(name, checked.basis, portionText);
  const food = buildFoodVersion({ name, aliases, basis: checked.basis, nutrients: checked.nutrients, sourceKind: checked.sourceKind }, id);
  return { ...food, range: checked.range, source: { kind: checked.sourceKind,
    reference: checked.sources.map((source) => `${source.provider}: ${source.description} (${source.url})`).join('; ') + ` · ${checked.reason}` } };
}
