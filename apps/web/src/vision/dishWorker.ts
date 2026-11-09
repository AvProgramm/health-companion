/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { photoPlacement, pixelsToTensor, topGuesses, type DishFacts, type DishGuess } from '../domain/dish/dishModel';
import { MODEL_URL } from './modelFiles';

/** What the worker tells the page: how far a download has got, then one final answer. */
export type DishWorkerReply = { downloaded: number } | { ok: true; guesses: DishGuess[] } | { ok: false; modelMissing: boolean };

// Served with the app, so the photo work never reaches for anything off this device
ort.env.wasm.wasmPaths = { wasm: wasmUrl };
// One thread, because sharing memory across threads needs headers a plain host may not send
ort.env.wasm.numThreads = 1;

// Loaded once, because reading the model is the slow part
let session: Promise<ort.InferenceSession> | null = null;

/** Send one reply to the page. */
function reply(message: DishWorkerReply) {
  self.postMessage(message);
}

/** Return the model's bytes, reporting each whole percent because the first download is large. */
async function readModel(facts: DishFacts): Promise<Uint8Array> {
  // Ignore a failed reply, because its body would not be a model
  const response = await fetch(MODEL_URL);
  if (!response.ok || response.body === null) throw new Error('The model could not be fetched.');

  // Fill one buffer of the known size, because joining pieces would need twice the memory
  const bytes = new Uint8Array(facts.modelBytes);
  const reader = response.body.getReader();
  let received = 0;
  let reported = -1;
  for (let part = await reader.read(); !part.done; part = await reader.read()) {
    bytes.set(part.value, received);
    received += part.value.length;
    const percent = Math.floor(received / facts.modelBytes * 100);
    if (percent !== reported) {
      reported = percent;
      reply({ downloaded: percent });
    }
  }

  // Ignore a short file, because a model cut off part-way must never be loaded
  if (received !== facts.modelBytes) throw new Error('The model arrived incomplete.');
  return bytes;
}

/** Return the model's input for a photo, cropped exactly as the training photos were. */
async function preparePhoto(photo: Blob, facts: DishFacts): Promise<ort.Tensor> {
  // Decode the photo, respecting the rotation the camera recorded
  const bitmap = await createImageBitmap(photo);
  const { scaledWidth, scaledHeight, x, y } = photoPlacement(bitmap.width, bitmap.height, facts);

  // Draw only the centre crop, smoothing because phone photos shrink a long way
  const canvas = new OffscreenCanvas(facts.imageSize, facts.imageSize);
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, x, y, scaledWidth, scaledHeight);
  bitmap.close();

  // Return the pixels in the shape the model expects
  const { data } = context.getImageData(0, 0, facts.imageSize, facts.imageSize);
  return new ort.Tensor('float32', pixelsToTensor(data, facts), [1, 3, facts.imageSize, facts.imageSize]);
}

self.onmessage = async (event: MessageEvent<{ photo: Blob; facts: DishFacts }>) => {
  const { photo, facts } = event.data;

  // Read the model the first time only
  let model: ort.InferenceSession;
  try {
    session ??= readModel(facts).then(bytes => ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] }));
    model = await session;
  } catch {
    // Allow a later photo to try loading the model again
    session = null;
    reply({ ok: false, modelMissing: true });
    return;
  }

  try {
    // Run the model here, so the screen stays responsive while it works
    const output = await model.run({ pixels: await preparePhoto(photo, facts) });
    reply({ ok: true, guesses: topGuesses(output.logits!.data as Float32Array, facts.dishes) });
  } catch {
    reply({ ok: false, modelMissing: false });
  }
};
