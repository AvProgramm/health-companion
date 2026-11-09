import { estimatedFood, readEstimate } from '../domain/nutrition/estimates';
import type { FoodVersion } from '../domain/nutrition/types';
import { postJson, type ServiceMessages } from './post';

// One bounded call to a public food database, plus the proxy hop
const BARCODE_TIMEOUT_MS = 12000;
// The barcode lengths used on packaged food
const BARCODE_DIGITS = /^\d{8,14}$/;
// What still works when a lookup fails
const FALLBACK = 'You can add the food by hand from its label.';

// What each kind of failure means for someone waiting on a lookup
const MESSAGES: ServiceMessages = {
  slow: `The lookup took too long. Try again. ${FALLBACK}`,
  unreachable: `Could not reach the laptop. ${FALLBACK}`,
  notRunning: `The laptop service is not running. ${FALLBACK}`,
  busy: `The food database is busy. Try again shortly. ${FALLBACK}`,
  failed: (status) => (status === 404 ? `That barcode is not in Open Food Facts. ${FALLBACK}` : `The lookup returned an error (HTTP ${status}). ${FALLBACK}`),
};

/** Return the digits of a barcode, or throw what to fix. */
export function readBarcodeDigits(text: string): string {
  const digits = text.replace(/\s/g, '');
  if (!BARCODE_DIGITS.test(digits)) {
    throw new Error('Enter the 8 to 14 digits printed under the barcode.');
  }
  return digits;
}

/** Return a food built from one barcode's label values, sending only the number. */
export async function lookUpBarcode(code: string, id: string): Promise<FoodVersion> {
  const reply = await postJson('/api/barcode', { code }, BARCODE_TIMEOUT_MS, MESSAGES) as { name?: unknown; estimate?: unknown };
  if (typeof reply.name !== 'string' || reply.name.trim() === '') {
    throw new Error(`That product has no usable name. ${FALLBACK}`);
  }
  const food = estimatedFood(reply.name, readEstimate(reply.estimate), id);
  // Open Food Facts records what is printed on the pack, so the review opens on "A nutrition label"
  return { ...food, source: { ...food.source, kind: 'label' } };
}
