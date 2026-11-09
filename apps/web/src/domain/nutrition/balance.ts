/**
 * How the day's food compares with the estimated daily need.
 *
 * Unknown stays unknown: an item with no energy value means the true intake could be
 * higher, so what is left is reported as "at most", never as an exact figure.
 */
import type { NutrientTotal } from './aggregate';

/** The day's energy position, in kcal. */
export interface EnergyBalance {
  eaten: number;
  unknownItems: number;
  need: number | null;
  // What is left before the estimated need; negative means over it, null means no need is known
  left: number | null;
  leftIsAtMost: boolean;
}

/** Return the day's balance from its energy total and the estimated daily need, if there is one. */
export function energyBalance(total: NutrientTotal, need: number | null): EnergyBalance {
  return { eaten: total.known, unknownItems: total.unknownItems, need, left: need === null ? null : need - total.known, leftIsAtMost: total.unknownItems > 0 };
}
