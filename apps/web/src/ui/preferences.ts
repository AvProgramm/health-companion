/**
 * Per-device display and photo preferences, kept in localStorage.
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

// Uploading a photo automatically needs an explicit choice on this device.
const AUTO_PHOTO_KEY = 'health-companion:auto-photo';

/** Return whether automatic photo uploads were explicitly enabled here. */
export function readAutoPhoto(): boolean {
  try {
    return localStorage.getItem(AUTO_PHOTO_KEY) === 'true';
  } catch {
    // Ignore blocked storage because an unreadable consent must default to no upload.
    return false;
  }
}

/** Remember the photo choice without storing the photo itself. */
export function writeAutoPhoto(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_PHOTO_KEY, String(enabled));
  } catch {
    // Ignore blocked storage because this choice can still last for the open screen.
  }
}
