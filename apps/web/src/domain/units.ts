/**
 * Units the diary understands, and safe conversion between them.
 *
 * Mass and volume are kept apart on purpose. Turning grams into millilitres needs
 * a density, and guessing one would silently change a nutrient total.
 */

// Every unit belongs to exactly one dimension
export type Unit = 'g' | 'kg' | 'mL' | 'L' | 'piece';

export interface Quantity {
  amount: number;
  unit: Unit;
}

type Dimension = 'mass' | 'volume' | 'count';

// Grams, millilitres and pieces are the base units of their dimensions,
// so 1 kg is stored as 1000 base units and 1 L as 1000 base units
const UNIT_TABLE: Record<Unit, { dimension: Dimension; toBase: number }> = {
  g: { dimension: 'mass', toBase: 1 },
  kg: { dimension: 'mass', toBase: 1000 },
  mL: { dimension: 'volume', toBase: 1 },
  L: { dimension: 'volume', toBase: 1000 },
  piece: { dimension: 'count', toBase: 1 },
};

export class UnitMismatchError extends Error {
  constructor(from: Unit, to: Unit) {
    super(`Cannot convert ${from} to ${to} without a density or a serving definition`);
    this.name = 'UnitMismatchError';
  }
}

/**
 * Return true if the value is one of the units in the table.
 *
 * Used when reading saved data or a backup file, where the unit arrives as plain text.
 */
export function isUnit(value: unknown): value is Unit {
  return typeof value === 'string' && Object.hasOwn(UNIT_TABLE, value);
}

/**
 * Return true if an amount in one unit can be converted to the other.
 */
export function areCompatible(a: Unit, b: Unit): boolean {
  return UNIT_TABLE[a].dimension === UNIT_TABLE[b].dimension;
}

/**
 * Return the quantity expressed in the target unit.
 *
 * The amount is converted through the base unit of its dimension. Units from
 * different dimensions throw UnitMismatchError instead of guessing a conversion.
 */
export function convertQuantity(quantity: Quantity, to: Unit): Quantity {
  // Refuse to convert between dimensions, e.g. grams of milk into millilitres
  if (!areCompatible(quantity.unit, to)) {
    throw new UnitMismatchError(quantity.unit, to);
  }

  // Nothing to do when the unit is already the target
  if (quantity.unit === to) {
    return { amount: quantity.amount, unit: to };
  }

  // Convert into the base unit, then out into the target unit
  const baseAmount = quantity.amount * UNIT_TABLE[quantity.unit].toBase;
  return { amount: baseAmount / UNIT_TABLE[to].toBase, unit: to };
}
