import { readDishFacts, type DishFacts, type DishGuess } from '../domain/dish/dishModel';
import type { DishWorkerReply } from './dishWorker';
import { FACTS_URL, MODEL_URL } from './modelFiles';

// How long the worker may stay silent: long enough for a slow phone to read the model and then a photo
const SILENCE_LIMIT_MS = 180000;
// Shown when a photo fails, with what still works
const COULD_NOT_READ = 'Could not read that photo. Try another, or type what you ate.';
// Shown when the model cannot be fetched or loaded, with what still works
const COULD_NOT_LOAD = 'Could not load the food model. Check your connection and try again, or type what you ate.';

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

/** Return whether the model is already on this device, so the card only warns about a real download. */
export async function modelIsKept(): Promise<boolean> {
  try {
    return await caches.match(MODEL_URL, { ignoreVary: true }) !== undefined;
  } catch {
    // Ignore a browser with no cache, because warning is the safe answer when nothing is known
    return false;
  }
}

/** Return the likely dishes for a photo, reporting any model download. The photo goes only to this device's worker. */
export function recogniseDish(photo: Blob, facts: DishFacts, onDownload: (percent: number) => void): Promise<DishGuess[]> {
  worker ??= new Worker(new URL('./dishWorker.ts', import.meta.url), { type: 'module' });
  const current = worker;

  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;

    /** Give up on a silent worker, dropping it so a late answer cannot be taken for a later photo's. */
    function giveUp() {
      current.terminate();
      worker = null;
      reject(new Error(COULD_NOT_READ));
    }

    /** Restart the countdown, so that only silence counts and a long download can finish. */
    function restartCountdown() {
      clearTimeout(timer);
      timer = setTimeout(giveUp, SILENCE_LIMIT_MS);
    }

    current.onmessage = (event: MessageEvent<DishWorkerReply>) => {
      const reply = event.data;

      // Pass on a download's progress and keep waiting, because the answer is still to come
      if ('downloaded' in reply) {
        restartCountdown();
        onDownload(reply.downloaded);
        return;
      }

      // Settle on the one final answer
      clearTimeout(timer);
      if (reply.ok) resolve(reply.guesses); else reject(new Error(reply.modelMissing ? COULD_NOT_LOAD : COULD_NOT_READ));
    };
    current.onerror = () => {
      clearTimeout(timer);
      reject(new Error(COULD_NOT_READ));
    };
    restartCountdown();
    current.postMessage({ photo, facts });
  });
}
