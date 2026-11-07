import type { NutrientValue } from './types';
import { convertQuantity, type Quantity } from '../shared/units';
import { assertFraction, assertNonNegative, assertPositive } from '../shared/validate';

/**
 * Return the nutrient amount for the portion actually eaten.
 *
 * The label gives a nutrient per basis quantity (e.g. 110.8 kcal per 250 mL).
 * The serving is converted into the label's unit, scaled by served / basis,
 * and then by the fraction eaten. Every input is validated first, even when the
 * nutrient is unknown, so a bad serving is never hidden behind a null.
 * No rounding happens here; rounding is for display only, so repeated
 * corrections never pile up rounding error.
 */
export function scaleNutrient(
  perBasis: NutrientValue,
  basis: Quantity,
  served: Quantity,
  eatenFraction: number,
): NutrientValue {
  // Check the label basis is a positive amount,
  // since a zero or negative basis would scale every nutrient on the label wrongly
  assertPositive(basis.amount, 'Basis amount');

  // Check the serving and the eaten fraction
  assertNonNegative(served.amount, 'Served amount');
  assertFraction(eatenFraction, 'Eaten fraction');

  // Check the nutrient value only when the label actually gave one
  if (perBasis !== null) {
    assertNonNegative(perBasis, 'Nutrient value');
  }

  // Express the serving in the label's unit
  // (throws UnitMismatchError for grams against a millilitre label)
  const servedInBasisUnit = convertQuantity(served, basis.unit);

  // Keep an unknown nutrient unknown instead of turning it into 0
  if (perBasis === null) {
    return null;
  }

  // Return the label value scaled to the serving, then to the share eaten
  return perBasis * (servedInBasisUnit.amount / basis.amount) * eatenFraction;
}
