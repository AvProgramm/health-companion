import { readEstimate } from '../domain/nutrition/estimates';

// Leave time for bounded database, web lookup and model fallback stages.
const ESTIMATE_TIMEOUT_MS = 27000;

// What the user can always do instead, added to every failure message
const FALLBACK = 'You can add it manually, or log it now and estimate later.';

/** Request a proposal using only food name and portion text. */
export async function requestEstimate(input: { name: string; portionText: string }) {
  let response: Response;
  try {
    response = await fetch('/api/estimate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
      body: JSON.stringify({ name: input.name, portionText: input.portionText }),
      signal: AbortSignal.timeout(ESTIMATE_TIMEOUT_MS),
    });
  } catch (problem) {
    throw new Error(unreachableMessage(problem));
  }
  if (!response.ok) {
    throw new Error(statusMessage(response.status));
  }
  return readEstimate(await response.json());
}

/**
 * Return why the request never got an answer: too slow, or no connection at all.
 */
function unreachableMessage(problem: unknown): string {
  // AbortSignal.timeout rejects with a TimeoutError; anything else means no connection
  if (problem instanceof DOMException && problem.name === 'TimeoutError') {
    return `The laptop took too long to answer. Try again. ${FALLBACK}`;
  }
  return `Could not reach the laptop. Check the USB cable, port forwarding and that the preview server is running. ${FALLBACK}`;
}

/**
 * Return what an error status means for the person waiting on an estimate.
 */
function statusMessage(status: number): string {
  // The preview proxy answers 502/504 when nothing is listening on the estimate port
  if (status === 502 || status === 504) {
    return `The laptop is reachable, but its estimate service is not running (see services/coach/README.md). ${FALLBACK}`;
  }
  // The service answers 503 when every database and model stage came back empty or busy
  if (status === 503) {
    return `No usable estimate came back; the food sources may be busy. Try a clearer name and portion, or try again shortly. ${FALLBACK}`;
  }
  return `The estimate service returned an error (HTTP ${status}). ${FALLBACK}`;
}
