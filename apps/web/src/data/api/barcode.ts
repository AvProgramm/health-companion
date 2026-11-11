import { estimatedFood, readEstimate } from '../../domain/nutrition/estimates';
import type { FoodVersion } from '../../domain/nutrition/types';
import { postJson, ServiceError, type ServiceMessages } from './post';

// One database lookup, or one photo read by a hosted model, plus the proxy hop
const BARCODE_TIMEOUT_MS = 20000;
// What still works when a lookup fails
const FALLBACK = 'You can read the packet label below, or add the food by hand.';

// What each kind of failure means for someone waiting on a lookup
const LOOKUP_MESSAGES: ServiceMessages = {
  slow: `The lookup took too long. Try again. ${FALLBACK}`,
  unreachable: `Could not reach the service. ${FALLBACK}`,
  notRunning: `The service is not running. ${FALLBACK}`,
  busy: `The food database could not be reached just now. Try again shortly. ${FALLBACK}`,
  failed: (status) => `The lookup returned an error (HTTP ${status}). ${FALLBACK}`,
};

// What each kind of failure means for someone waiting on a label photo to be read
const LABEL_MESSAGES: ServiceMessages = {
  ...LOOKUP_MESSAGES,
  busy: 'The label reader is unavailable right now. Try again, or add the food by hand.',
  failed: (status) => status === 409
    ? 'The photo shows a different barcode. Check the digits and the packet.'
    : 'Could not read that label. Use a clear photo of the nutrition panel, and type the product name if it is not on the photo.',
};

/**
 * Return a food built from one barcode's database label, or null when the database does not hold it.
 *
 * Only the number is sent. A miss is an answer, not a failure, so the screen can move
 * on to the packet's own label instead of showing an error.
 */
export async function lookUpBarcode(code: string, id: string): Promise<FoodVersion | null> {
  try {
    return labelFood(await postJson('/api/barcode', { code }, BARCODE_TIMEOUT_MS, LOOKUP_MESSAGES), id);
  } catch (problem) {
    // The service answers 404 only after the database was asked and had no such product
    if (problem instanceof ServiceError && problem.status === 404) return null;
    throw problem;
  }
}

/** Return an editable label from one explicitly submitted packet photo. */
export async function readPacketLabel(code: string, name: string, image: string, id: string): Promise<FoodVersion> {
  return labelFood(await postJson('/api/barcode/label', { code, name, image }, BARCODE_TIMEOUT_MS, LABEL_MESSAGES), id);
}

/** Validate a label reply before opening it for review. */
function labelFood(value: unknown, id: string): FoodVersion {
  const reply = value as { name?: unknown; estimate?: unknown } | null;
  if (reply === null || typeof reply.name !== 'string' || reply.name.trim() === '') {
    throw new Error('That product has no usable name. Add the food by hand from its label.');
  }
  const food = estimatedFood(reply.name, readEstimate(reply.estimate), id);
  // Keep label provenance in the editor for both database and photo drafts.
  return { ...food, source: { ...food.source, kind: 'label' } };
}
