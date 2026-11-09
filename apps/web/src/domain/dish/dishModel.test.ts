import { describe, expect, it } from 'vitest';
import { dishLabel, photoPlacement, pixelsToTensor, readDishFacts, topGuesses } from './dishModel';

// Facts shaped like the ones the export step writes
const FACTS = { dishes: ['fried_rice', 'nasi_lemak', 'satay'], mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5], storedSize: 256, imageSize: 224, modelBytes: 1000 };

describe('readDishFacts', () => {
  it('accepts what the export step writes', () => {
    expect(readDishFacts(FACTS)).toEqual(FACTS);
  });

  it.each([null, 'page', {}, { ...FACTS, dishes: [] }, { ...FACTS, mean: [0.5] }, { ...FACTS, std: [0, 1, 1] }, { ...FACTS, imageSize: 300 }, { ...FACTS, modelBytes: 0 }, { ...FACTS, modelBytes: 1.5 }, { ...FACTS, modelBytes: undefined }])('treats a malformed file as no model: %j', (value) => {
    expect(readDishFacts(value)).toBeNull();
  });
});

describe('photoPlacement', () => {
  it('matches the training crop worked by hand for a wide photo', () => {
    // Scale 256 / 384 gives 341 x 256. The centre square starts at floor(85 / 2) = 42, and the crop 16 further in
    expect(photoPlacement(512, 384, FACTS)).toEqual({ scaledWidth: 341, scaledHeight: 256, x: -58, y: -16 });
  });

  it('matches the training crop worked by hand for a tall phone photo', () => {
    // Scale 256 / 3000 gives 256 x 341, so the shift is on the height this time
    expect(photoPlacement(3000, 4000, FACTS)).toEqual({ scaledWidth: 256, scaledHeight: 341, x: -16, y: -58 });
  });

  it('only crops a photo that is already square', () => {
    expect(photoPlacement(256, 256, FACTS)).toEqual({ scaledWidth: 256, scaledHeight: 256, x: -16, y: -16 });
  });
});

describe('pixelsToTensor', () => {
  it('scales, normalises and puts channels first, as the Python does', () => {
    // Two RGBA pixels on a 1 x 2 grid would not be square, so use a 1 x 1 model input
    const tensor = pixelsToTensor(new Uint8ClampedArray([255, 0, 128, 77]), { imageSize: 1, mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5] });
    expect(tensor[0]).toBeCloseTo(1, 6);
    expect(tensor[1]).toBeCloseTo(-1, 6);
    expect(tensor[2]).toBeCloseTo((128 / 255 - 0.5) / 0.5, 6);
  });

  it('keeps the channels in separate planes', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
    const tensor = pixelsToTensor(rgba, { imageSize: 2, mean: [0, 0, 0], std: [1, 1, 1] });
    expect(Array.from(tensor)).toEqual([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1]);
  });
});

describe('topGuesses', () => {
  it('matches the softmax worked by hand', () => {
    // Scores differ by ln 3, so the odds are three to one
    const guesses = topGuesses([Math.log(3), 0], ['satay', 'laksa']);
    expect(guesses[0]).toEqual({ dish: 'satay', probability: expect.closeTo(0.75, 9) as number });
    expect(guesses[1]!.probability).toBeCloseTo(0.25, 9);
  });

  it('keeps five guesses, best first', () => {
    const guesses = topGuesses([0, 6, 5, 4, 3, 2, 1], ['g', 'a', 'b', 'c', 'd', 'e', 'f']);
    expect(guesses.map(guess => guess.dish)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('survives very large scores', () => {
    expect(topGuesses([100000, 99999], ['a', 'b'])[0]!.probability).toBeGreaterThan(0.7);
  });

  it('breaks ties by name', () => {
    expect(topGuesses([1, 1], ['b', 'a']).map(guess => guess.dish)).toEqual(['a', 'b']);
  });
});

describe('dishLabel', () => {
  it('reads like a dish name', () => {
    expect(dishLabel('nasi_lemak')).toBe('Nasi lemak');
  });
});
