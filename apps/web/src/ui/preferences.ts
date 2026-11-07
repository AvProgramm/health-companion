/**
 * Per-device display preferences, kept in localStorage.
 *
 * These are conveniences, not diary data, so a browser that blocks storage simply
 * falls back to the default instead of failing.
 */

const HIDE_NUMBERS_KEY = 'health-companion:hide-numbers';

/**
 * Return whether nutrient numbers should be hidden.
 */
export function readHideNumbers(): boolean {
  try {
    return localStorage.getItem(HIDE_NUMBERS_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Remember whether nutrient numbers should be hidden.
 */
export function writeHideNumbers(hide: boolean): void {
  try {
    localStorage.setItem(HIDE_NUMBERS_KEY, String(hide));
  } catch {
    // Ignore a blocked storage; the setting just lasts until the page closes
  }
}
