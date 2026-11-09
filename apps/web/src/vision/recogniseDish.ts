import { readDishFacts, type DishFacts, type DishGuess } from '../domain/dish/dishModel';

// Where the export step leaves the facts about the model
const FACTS_URL = '/models/dish/labels.json';
// A first run has to read the model too, and a phone can be slow at that
const RECOGNISE_TIMEOUT_MS = 90000;
// Shown for any failure, with what still works
const COULD_NOT_READ = 'Could not read that photo. Try another, or type what you ate.';

// Kept for later photos, because the worker holds the loaded model
let worker: Worker | null = null;

/** Return the facts about the installed model, or null when this build has none. */
export async function loadDishFacts(): Promise<DishFacts | null> {
  try {
    const response = await fetch(FACTS_URL);
    return response.ok ? readDishFacts(await response.json()) : null;
  } catch {
    // Ignore a missing or unreadable file, because the app works without a model
    return null;
  }
}

/** Return the likely dishes for a photo. The photo goes only to this device's worker. */
export function recogniseDish(photo: Blob, facts: DishFacts): Promise<DishGuess[]> {
  worker ??= new Worker(new URL('./dishWorker.ts', import.meta.url), { type: 'module' });
  const current = worker;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(COULD_NOT_READ)), RECOGNISE_TIMEOUT_MS);
    current.onmessage = (event: MessageEvent<{ ok: boolean; guesses?: DishGuess[] }>) => {
      clearTimeout(timer);
      if (event.data.ok) resolve(event.data.guesses!); else reject(new Error(COULD_NOT_READ));
    };
    current.onerror = () => {
      clearTimeout(timer);
      reject(new Error(COULD_NOT_READ));
    };
    current.postMessage({ photo, facts });
  });
}
