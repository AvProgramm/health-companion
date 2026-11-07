import { buildFoodVersion } from './foods';
import { SUMMARY_NUTRIENTS } from './day';
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
    if (!SUMMARY_NUTRIENTS.includes(key as NutrientKey)) throw new Error('Return only supported nutrient ranges.');
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
  for (const key of SUMMARY_NUTRIENTS) {
    const nutrient = value.nutrients[key];
    if (nutrient !== null && !nonNegative(nutrient)) throw new Error('Return each nutrient as a number or null.');
    if (!(key in value.range)) throw new Error('Return a range for every nutrient.');
  }
  const nutrients = value.nutrients;
  if (SUMMARY_NUTRIENTS.every((key) => nutrients[key] === null)) {
    throw new Error('No nutrition values were returned. Try a clearer portion or add the food manually.');
  }
  for (const source of value.sources) {
    if (!record(source) || typeof source.provider !== 'string' || source.provider.length === 0 ||
        typeof source.description !== 'string' || typeof source.url !== 'string' || !source.url.startsWith('https://')) {
      throw new Error('Return the sources used for this estimate.');
    }
  }
  // Reuse label validation for the portion and all finite nutrient values.
  const proposal = value as unknown as NutritionEstimate;
  buildFoodVersion({ name: 'Estimate', aliases: [], basis: proposal.basis, nutrients: proposal.nutrients, sourceKind: proposal.sourceKind }, 'validation');
  validateRanges(proposal.nutrients, proposal.range);
  return proposal;
}

/** Return a food version only when the user accepts a checked proposal. */
export function estimatedFood(name: string, estimate: NutritionEstimate, id: string): FoodVersion {
  const checked = readEstimate(estimate);
  const food = buildFoodVersion({ name, aliases: [], basis: checked.basis, nutrients: checked.nutrients, sourceKind: checked.sourceKind }, id);
  return { ...food, range: checked.range, source: { kind: checked.sourceKind,
    reference: checked.sources.map((source) => `${source.provider}: ${source.description} (${source.url})`).join('; ') + ` · ${checked.reason}` } };
}
