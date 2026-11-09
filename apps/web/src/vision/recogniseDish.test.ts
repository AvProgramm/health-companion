import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DishFacts } from '../domain/dish/dishModel';

// Facts shaped like the ones the export step writes
const FACTS: DishFacts = { dishes: ['satay'], mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5], storedSize: 256, imageSize: 224, modelBytes: 1000 };
// A fictional photo; its contents are never read here
const PHOTO = new Blob(['fictional']);
// How long the worker may stay silent, worked out from the module's three minutes
const SILENCE_MS = 180000;

/** Stand in for the worker, keeping every one made so a test can answer as it would. */
class FakeWorker {
  static made: FakeWorker[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    FakeWorker.made.push(this);
  }

  /** Answer the page as the real worker would. */
  say(data: unknown) {
    this.onmessage!({ data });
  }
}

/** Return a fresh copy of the module, because it keeps its worker between photos. */
async function freshModule() {
  vi.resetModules();
  return import('./recogniseDish');
}

beforeEach(() => {
  FakeWorker.made = [];
  vi.stubGlobal('Worker', FakeWorker);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('recogniseDish', () => {
  it('reports the download and returns the guesses', async () => {
    const { recogniseDish } = await freshModule();
    const onDownload = vi.fn();
    const answer = recogniseDish(PHOTO, FACTS, onDownload);
    FakeWorker.made[0]!.say({ downloaded: 42 });
    FakeWorker.made[0]!.say({ ok: true, guesses: [{ dish: 'satay', probability: 0.9 }] });
    await expect(answer).resolves.toEqual([{ dish: 'satay', probability: 0.9 }]);
    expect(onDownload).toHaveBeenCalledWith(42);
  });

  it('counts only silence, so a long download can finish', async () => {
    const { recogniseDish } = await freshModule();
    const answer = recogniseDish(PHOTO, FACTS, () => {});

    // Each report arrives just before the limit, and together they run far past it
    for (const percent of [1, 2, 3]) {
      vi.advanceTimersByTime(SILENCE_MS - 1);
      FakeWorker.made[0]!.say({ downloaded: percent });
    }
    FakeWorker.made[0]!.say({ ok: true, guesses: [] });
    await expect(answer).resolves.toEqual([]);
    expect(FakeWorker.made[0]!.terminate).not.toHaveBeenCalled();
  });

  it('drops a silent worker, so a late answer cannot be taken for a later photo', async () => {
    const { recogniseDish } = await freshModule();
    const answer = recogniseDish(PHOTO, FACTS, () => {});
    vi.advanceTimersByTime(SILENCE_MS);
    await expect(answer).rejects.toThrow('Could not read that photo.');
    expect(FakeWorker.made[0]!.terminate).toHaveBeenCalled();

    // The next photo starts over with a new worker
    void recogniseDish(PHOTO, FACTS, () => {}).catch(() => {});
    expect(FakeWorker.made).toHaveLength(2);
  });

  it('keeps the worker for the next photo after an answer', async () => {
    const { recogniseDish } = await freshModule();
    const first = recogniseDish(PHOTO, FACTS, () => {});
    FakeWorker.made[0]!.say({ ok: true, guesses: [] });
    await first;
    void recogniseDish(PHOTO, FACTS, () => {}).catch(() => {});
    expect(FakeWorker.made).toHaveLength(1);
  });

  it('says the model could not be loaded when that was the problem', async () => {
    const { recogniseDish } = await freshModule();
    const answer = recogniseDish(PHOTO, FACTS, () => {});
    FakeWorker.made[0]!.say({ ok: false, modelMissing: true });
    await expect(answer).rejects.toThrow('Could not load the food model. Check your connection and try again, or type what you ate.');
  });

  it('blames the photo when the model was fine', async () => {
    const { recogniseDish } = await freshModule();
    const answer = recogniseDish(PHOTO, FACTS, () => {});
    FakeWorker.made[0]!.say({ ok: false, modelMissing: false });
    await expect(answer).rejects.toThrow('Could not read that photo. Try another, or type what you ate.');
  });

  it('stops the countdown after an answer', async () => {
    const { recogniseDish } = await freshModule();
    const answer = recogniseDish(PHOTO, FACTS, () => {});
    FakeWorker.made[0]!.say({ ok: true, guesses: [] });
    await answer;
    vi.advanceTimersByTime(SILENCE_MS);
    expect(FakeWorker.made[0]!.terminate).not.toHaveBeenCalled();
  });
});

describe('modelIsKept', () => {
  it('is true when a cache holds the model', async () => {
    const { modelIsKept } = await freshModule();
    vi.stubGlobal('caches', { match: vi.fn().mockResolvedValue(new Response('model')) });
    await expect(modelIsKept()).resolves.toBe(true);
  });

  it('is false when no cache holds it', async () => {
    const { modelIsKept } = await freshModule();
    vi.stubGlobal('caches', { match: vi.fn().mockResolvedValue(undefined) });
    await expect(modelIsKept()).resolves.toBe(false);
  });

  it('warns rather than stays quiet where the browser has no cache', async () => {
    const { modelIsKept } = await freshModule();
    vi.stubGlobal('caches', undefined);
    await expect(modelIsKept()).resolves.toBe(false);
  });
});
