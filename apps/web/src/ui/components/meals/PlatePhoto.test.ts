// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadDishFacts, modelIsKept, recogniseDish } from '../../../vision/recogniseDish';
import { PlatePhoto } from './PlatePhoto';

// The worker cannot run under test, so its entry points are replaced
vi.mock('../../../vision/recogniseDish', () => ({ loadDishFacts: vi.fn(), modelIsKept: vi.fn(), recogniseDish: vi.fn() }));

// Facts shaped like the ones the export step writes
const FACTS = { dishes: ['nasi_lemak', 'satay'], mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5], storedSize: 256, imageSize: 224, modelBytes: 187_123_456 };
// A fictional photo; its contents are never read here
const PHOTO = new File(['fictional'], 'plate.jpg', { type: 'image/jpeg' });

let root: Root;
let container: HTMLDivElement;
const onPick = vi.fn();

/** Display the card and let the model check settle. */
async function show() {
  await act(async () => root.render(createElement(PlatePhoto, { onPick })));
}

/** Choose the fictional photo and let the suggestions settle. */
async function choosePhoto() {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { value: [PHOTO], configurable: true });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  URL.createObjectURL = vi.fn(() => 'blob:fictional');
  URL.revokeObjectURL = vi.fn();
  vi.clearAllMocks();
  vi.mocked(loadDishFacts).mockResolvedValue(FACTS);
  vi.mocked(modelIsKept).mockResolvedValue(true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('Photo of your plate', () => {
  it('stays hidden in a build with no model', async () => {
    vi.mocked(loadDishFacts).mockResolvedValue(null);
    await show();
    expect(container.textContent).toBe('');
  });

  it('shows the suggestions best first, with whole percentages', async () => {
    vi.mocked(recogniseDish).mockResolvedValue([{ dish: 'nasi_lemak', probability: 0.864 }, { dish: 'satay', probability: 0.1 }]);
    await show();
    await choosePhoto();
    expect([...container.querySelectorAll('.dish-guess')].map(button => button.textContent)).toEqual(['Nasi lemak86%', 'Satay10%']);
  });

  it('never sends the photo over the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(recogniseDish).mockResolvedValue([{ dish: 'satay', probability: 0.9 }]);
    await show();
    await choosePhoto();
    expect(recogniseDish).toHaveBeenCalledWith(PHOTO, FACTS, expect.any(Function));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('warns about the one-off download before the first photo, with the real size', async () => {
    vi.mocked(modelIsKept).mockResolvedValue(false);
    await show();
    expect(container.textContent).toContain('The first photo downloads the food model once, 187 MB, and keeps it on this device.');
  });

  it('says nothing about a download when the model is already here', async () => {
    await show();
    expect(container.textContent).not.toContain('downloads the food model');
  });

  it('shows how far the first download has got', async () => {
    vi.mocked(modelIsKept).mockResolvedValue(false);
    vi.mocked(recogniseDish).mockImplementation((_photo, _facts, onDownload) => {
      onDownload(42);
      return new Promise(() => {});
    });
    await show();
    await choosePhoto();
    expect(container.querySelector('.plate-button')?.textContent).toBe('Downloading the food model, 42%');
  });

  it('stops warning once the first photo has fetched the model', async () => {
    vi.mocked(modelIsKept).mockResolvedValue(false);
    vi.mocked(recogniseDish).mockResolvedValue([{ dish: 'satay', probability: 0.9 }]);
    await show();
    await choosePhoto();
    expect(container.textContent).not.toContain('downloads the food model');
  });

  it('does not count a kept model loading as a download', async () => {
    vi.mocked(recogniseDish).mockImplementation((_photo, _facts, onDownload) => {
      onDownload(42);
      return new Promise(() => {});
    });
    await show();
    await choosePhoto();
    expect(container.querySelector('.plate-button')?.textContent).toBe('Looking at your plate…');
  });

  it('does not claim every name was trained on', async () => {
    vi.mocked(recogniseDish).mockResolvedValue([{ dish: 'satay', probability: 0.9 }]);
    await show();
    await choosePhoto();
    expect(container.textContent).toContain('Suggestions only, from 2 food names.');
    expect(container.textContent).not.toContain('trained on');
  });

  it('only fills the entry box when a dish is picked', async () => {
    vi.mocked(recogniseDish).mockResolvedValue([{ dish: 'nasi_lemak', probability: 0.9 }]);
    await show();
    await choosePhoto();
    expect(onPick).not.toHaveBeenCalled();
    await act(async () => container.querySelector<HTMLButtonElement>('.dish-guess')!.click());
    expect(onPick).toHaveBeenCalledWith('nasi lemak');
  });

  it('says when it is unsure', async () => {
    vi.mocked(recogniseDish).mockResolvedValue([{ dish: 'satay', probability: 0.49 }]);
    await show();
    await choosePhoto();
    expect(container.textContent).toContain('Not sure about this one.');
  });

  it('asks plainly from the confidence where the first guess was right three times in four', async () => {
    vi.mocked(recogniseDish).mockResolvedValue([{ dish: 'satay', probability: 0.5 }]);
    await show();
    await choosePhoto();
    expect(container.textContent).toContain('Which is it?');
  });

  it('says what to do when a photo cannot be read', async () => {
    vi.mocked(recogniseDish).mockRejectedValue(new Error('Could not read that photo. Try another, or type what you ate.'));
    await show();
    await choosePhoto();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('type what you ate');
  });

  it('ignores a cancelled camera', async () => {
    await show();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [], configurable: true });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    expect(recogniseDish).not.toHaveBeenCalled();
  });
});
