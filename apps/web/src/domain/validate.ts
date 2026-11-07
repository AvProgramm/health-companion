/**
 * Small number checks shared by the domain functions.
 *
 * Each check throws a RangeError with the field name, so a bad value is reported
 * where it entered instead of turning into NaN somewhere in a daily total.
 */

/**
 * Throw unless the value is a finite number.
 *
 * NaN fails every < and > comparison, so a range check on its own would let it
 * through. This check must run before any range check.
 */
export function assertFinite(value: number, label: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number, got ${value}`);
  }
}

/**
 * Throw unless the value is a finite number that is zero or more.
 */
export function assertNonNegative(value: number, label: string): void {
  assertFinite(value, label);
  if (value < 0) {
    throw new RangeError(`${label} cannot be negative, got ${value}`);
  }
}

/**
 * Throw unless the value is a finite number above zero.
 */
export function assertPositive(value: number, label: string): void {
  assertFinite(value, label);
  if (value <= 0) {
    throw new RangeError(`${label} must be positive, got ${value}`);
  }
}

/**
 * Throw unless the value is a finite fraction within [0, 1].
 */
export function assertFraction(value: number, label: string): void {
  assertFinite(value, label);
  if (value < 0 || value > 1) {
    throw new RangeError(`${label} must be within [0, 1], got ${value}`);
  }
}
