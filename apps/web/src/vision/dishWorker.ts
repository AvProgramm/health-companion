/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { photoPlacement, pixelsToTensor, topGuesses, type DishFacts } from '../domain/dish/dishModel';

// Served with the app, so the photo work never reaches for anything off this device
ort.env.wasm.wasmPaths = { wasm: wasmUrl };
// One thread, because sharing memory across threads needs headers a plain host may not send
ort.env.wasm.numThreads = 1;

// The model the export step leaves in public/
const MODEL_URL = '/models/dish/model.onnx';

// Loaded once, because reading the model is the slow part
let session: Promise<ort.InferenceSession> | null = null;

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
  try {
    // Run the model here, so the screen stays responsive while it works
    const { photo, facts } = event.data;
    session ??= ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'] });
    const model = await session;
    const output = await model.run({ pixels: await preparePhoto(photo, facts) });
    self.postMessage({ ok: true, guesses: topGuesses(output.logits!.data as Float32Array, facts.dishes) });
  } catch {
    // Allow a later photo to try loading the model again
    session = null;
    self.postMessage({ ok: false });
  }
};
