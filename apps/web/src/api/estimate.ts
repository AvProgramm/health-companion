import { readEstimate } from '../domain/nutrition/estimates';

// Leave time for both database lookup and the optional model fallback.
const ESTIMATE_TIMEOUT_MS = 15000;

/** Request a proposal using only food name and portion text. */
export async function requestEstimate(input: { name: string; portionText: string }) {
  let response: Response;
  try {
    response = await fetch('/api/estimate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
      body: JSON.stringify({ name: input.name, portionText: input.portionText }),
      signal: AbortSignal.timeout(ESTIMATE_TIMEOUT_MS),
    });
  } catch {
    throw new Error('Estimates need the laptop. Add it manually or log it now and estimate later.');
  }
  if (!response.ok) throw new Error('Estimates need the laptop and an available food source. Add it manually or log it now and estimate later.');
  return readEstimate(await response.json());
}
