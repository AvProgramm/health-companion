// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadDishFacts, recogniseDish } from '../vision/recogniseDish';
import { PlatePhoto } from './PlatePhoto';

// The worker cannot run under test, so its two entry points are replaced
vi.mock('../vision/recogniseDish', () => ({ loadDishFacts: vi.fn(), recogniseDish: vi.fn() }));

// Facts shaped like the ones the export step writes
const FACTS = { dishes: ['nasi_lemak', 'satay'], mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5], storedSize: 256, imageSize: 224 };
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
    expect(recogniseDish).toHaveBeenCalledWith(PHOTO, FACTS);
    expect(fetchMock).not.toHaveBeenCalled();
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
    vi.mocked(recogniseDish).mockResolvedValue([{ dish: 'satay', probability: 0.2 }]);
    await show();
    await choosePhoto();
    expect(container.textContent).toContain('Not sure about this one.');
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
