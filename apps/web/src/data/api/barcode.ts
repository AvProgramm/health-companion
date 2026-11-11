import { estimatedFood, readEstimate } from '../../domain/nutrition/estimates';
import type { FoodVersion } from '../../domain/nutrition/types';
import { postJson, type ServiceMessages } from './post';

// Allow a bounded label verification after a conflicting database record.
const BARCODE_TIMEOUT_MS = 20000;
// The barcode lengths used on packaged food
const BARCODE_DIGITS = /^\d{8,14}$/;
// What still works when a lookup fails
const FALLBACK = 'You can add the food by hand from its label.';
// A missing or conflicting database label can be checked from the packet itself.
const PACKET_FALLBACK = 'Read a packet label with AI or add the food by hand.';

// What each kind of failure means for someone waiting on a lookup
const MESSAGES: ServiceMessages = {
  slow: `The lookup took too long. Try again. ${FALLBACK}`,
  unreachable: `Could not reach the laptop. ${FALLBACK}`,
  notRunning: `The laptop service is not running. ${FALLBACK}`,
  busy: `The food database is busy. Try again shortly. ${FALLBACK}`,
  failed: (status) => {
    if (status === 404) return `That barcode is not in Open Food Facts. ${PACKET_FALLBACK}`;
    if (status === 409) return `The database record has conflicting nutrition values. ${PACKET_FALLBACK}`;
    return `The lookup returned an error (HTTP ${status}). ${FALLBACK}`;
  },
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
export async function lookUpBarcode(code: string, id: string): Promise<{ food: FoodVersion; reviewNote?: string }> {
  const reply = await postJson('/api/barcode', { code }, BARCODE_TIMEOUT_MS, MESSAGES);
  const food = labelFood(reply, id);

  // A service without a review note can still return a complete draft.
  const reviewNote = (reply as { reviewNote?: unknown }).reviewNote;
  return typeof reviewNote === 'string' && reviewNote.trim() !== '' ? { food, reviewNote } : { food };
}

/** Return an editable label from one explicitly submitted packet photo. */
export async function readPacketLabel(code: string, name: string, image: string, id: string): Promise<FoodVersion> {
  const reply = await postJson('/api/barcode/label', { code, name, image }, BARCODE_TIMEOUT_MS, {
    ...MESSAGES,
    busy: 'The label reader is unavailable right now. Try again or add the food by hand.',
    failed: (status) => status === 409
      ? 'The photo shows a different barcode. Check the digits and packet.'
      : 'Could not read that label. Use a clear nutrition panel photo and enter the product name if needed.',
  });
  return labelFood(reply, id);
}

/** Validate a label reply before opening it for review. */
function labelFood(value: unknown, id: string): FoodVersion {
  const reply = value as { name?: unknown; estimate?: unknown } | null;
  if (reply === null || typeof reply.name !== 'string' || reply.name.trim() === '') {
    throw new Error(`That product has no usable name. ${FALLBACK}`);
  }
  const food = estimatedFood(reply.name, readEstimate(reply.estimate), id);
  // Keep label provenance in the editor for both database and photo drafts.
  return { ...food, source: { ...food.source, kind: 'label' } };
}
