/** What the phone needs in order to use the trained model, written beside it by the export step. */
export interface DishFacts {
  dishes: readonly string[];
  mean: readonly number[];
  std: readonly number[];
  storedSize: number;
  imageSize: number;
}

/** One suggestion: a dish, and how likely the model thinks it is. */
export interface DishGuess {
  dish: string;
  probability: number;
}

// Suggestions offered to the person, matching the top-5 measured on the sealed photos
const TOP_GUESSES = 5;

/** Return whether a value is a non-empty list of numbers. */
function numberList(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'number' && Number.isFinite(item));
}

/** Return the facts as validated data, or null when no usable model is installed. */
export function readDishFacts(value: unknown): DishFacts | null {
  const facts = value as Partial<DishFacts> | null;

  // Ignore anything malformed, because a host can answer a missing file with a web page
  if (facts === null || typeof facts !== 'object' || !Array.isArray(facts.dishes) || facts.dishes.length === 0 || !facts.dishes.every(dish => typeof dish === 'string') ||
      !numberList(facts.mean) || facts.mean.length !== 3 || !numberList(facts.std) || facts.std.length !== 3 || !facts.std.every(value_ => value_ > 0) ||
      typeof facts.storedSize !== 'number' || typeof facts.imageSize !== 'number' || facts.imageSize > facts.storedSize) {
    return null;
  }
  return facts as DishFacts;
}

/**
 * Return where to draw a photo so the model sees what it saw in training.
 *
 * This mirrors the Python exactly: the short side is scaled to the stored size, the centre
 * square is kept, and the model's input is the centre of that square.
 */
export function photoPlacement(width: number, height: number, facts: Pick<DishFacts, 'storedSize' | 'imageSize'>) {
  // Scale the short side, keeping the shape of the plate
  const scale = facts.storedSize / Math.min(width, height);
  const scaledWidth = Math.max(facts.storedSize, Math.round(width * scale));
  const scaledHeight = Math.max(facts.storedSize, Math.round(height * scale));

  // Shift the picture so that only the centre crop lands on the canvas
  const inner = Math.round((facts.storedSize - facts.imageSize) / 2);
  return { scaledWidth, scaledHeight, x: -(Math.floor((scaledWidth - facts.storedSize) / 2) + inner), y: -(Math.floor((scaledHeight - facts.storedSize) / 2) + inner) };
}

/** Return the canvas's RGBA pixels as the model's input: channels first, scaled and normalised. */
export function pixelsToTensor(rgba: Uint8ClampedArray, facts: Pick<DishFacts, 'imageSize' | 'mean' | 'std'>): Float32Array {
  const pixels = facts.imageSize * facts.imageSize;
  const tensor = new Float32Array(3 * pixels);

  // Skip the alpha channel, which the model has never seen
  for (let pixel = 0; pixel < pixels; pixel++) {
    for (let channel = 0; channel < 3; channel++) {
      tensor[channel * pixels + pixel] = (rgba[pixel * 4 + channel]! / 255 - facts.mean[channel]!) / facts.std[channel]!;
    }
  }
  return tensor;
}

/** Return the most likely dishes, best first, from the model's raw scores. */
export function topGuesses(logits: ArrayLike<number>, dishes: readonly string[]): DishGuess[] {
  // Measure from the largest score, so exponentials of large numbers cannot overflow
  const scores = Array.from(logits);
  const largest = Math.max(...scores);
  const weights = scores.map(score => Math.exp(score - largest));
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  // Break ties by name, so the same photo always shows the same order
  return weights.map((weight, index) => ({ dish: dishes[index]!, probability: weight / total }))
    .sort((left, right) => right.probability - left.probability || left.dish.localeCompare(right.dish)).slice(0, TOP_GUESSES);
}

/** Return a stored dish name as it reads on a chip, such as "Nasi lemak". */
export function dishLabel(dish: string): string {
  const words = dish.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
