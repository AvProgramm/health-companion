import { readEstimate } from '../domain/nutrition/estimates';
import { postJson, type ServiceMessages } from './post';

// Leave time for bounded database, web lookup and model fallback stages.
const ESTIMATE_TIMEOUT_MS = 27000;

// What the user can always do instead, added to every failure message
const FALLBACK = 'You can add it manually, or log it now and estimate later.';

// What each kind of failure means for someone waiting on an estimate
const MESSAGES: ServiceMessages = {
  slow: `The laptop took too long to answer. Try again. ${FALLBACK}`,
  unreachable: `Could not reach the laptop. Check the USB cable, port forwarding and that the preview server is running. ${FALLBACK}`,
  notRunning: `The laptop is reachable, but its estimate service is not running (see services/coach/README.md). ${FALLBACK}`,
  busy: `No usable estimate came back; the food sources may be busy. Try a clearer name and portion, or try again shortly. ${FALLBACK}`,
  failed: (status) => `The estimate service returned an error (HTTP ${status}). ${FALLBACK}`,
};

/** Request a proposal using only food name and portion text. */
export async function requestEstimate(input: { name: string; portionText: string }) {
  return readEstimate(await postJson('/api/estimate', { name: input.name, portionText: input.portionText }, ESTIMATE_TIMEOUT_MS, MESSAGES));
}
