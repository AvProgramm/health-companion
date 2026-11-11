// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readBarcodeDigits } from '../../../data/api/barcode';
import { BarcodeScan } from './BarcodeScan';

vi.mock('../../../vision/shrinkPhoto', () => ({
  shrinkPhoto: vi.fn().mockResolvedValue('data:image/jpeg;base64,ZmFrZQ=='),
}));

// A label reply shaped like the service's, with every nutrient key present
const NUTRIENTS = { kcal: 400, protein_g: 10, carbs_g: 70, fibre_g: 5, total_sugar_g: 20, added_sugar_g: null, fat_g: 8, satfat_g: 2, unsatfat_g: null, sodium_mg: 300 };
const RANGE = Object.fromEntries(Object.entries(NUTRIENTS).map(([key, value]) => [key, value === null ? null : { low: value, high: value }]));
const REPLY = { name: 'Fictional oat biscuit', estimate: { basis: { amount: 100, unit: 'g' }, nutrients: NUTRIENTS, range: RANGE, sourceKind: 'database', reason: 'Fictional reason.', sources: [{ provider: 'Open Food Facts', description: 'Fictional oat biscuit', url: 'https://example.org/1' }] } };

let root: Root;
let container: HTMLDivElement;
const onFound = vi.fn();

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(BarcodeScan, { onFound })));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

/** Type a barcode and submit it, letting the lookup settle. */
async function lookUp(text: string) {
  const field = container.querySelector<HTMLInputElement>('#barcode-code')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, text);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => container.querySelector('form')!.requestSubmit());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}

describe('barcode digits', () => {
  it('accepts a printed barcode with spaces', () => {
    expect(readBarcodeDigits(' 9556 001 234567 ')).toBe('9556001234567');
  });

  it.each(['', '123', 'abcdefgh', '123456789012345'])('refuses %j', (text) => {
    expect(() => readBarcodeDigits(text)).toThrow(/8 to 14 digits/);
  });
});

describe('Scan a barcode', () => {
  it('sends only the number, and hands the food over without saving it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => REPLY });
    vi.stubGlobal('fetch', fetchMock);
    await lookUp('9556001234567');
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ code: '9556001234567' });
    expect(onFound.mock.calls[0]![0]).toMatchObject({ name: 'Fictional oat biscuit', basis: { amount: 100, unit: 'g' } });
  });

  it('shows scanned digits before looking up the product', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => REPLY });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ close: vi.fn() }));
    vi.stubGlobal('BarcodeDetector', class {
      detect = vi.fn().mockResolvedValue([{ rawValue: '9556001234567' }]);
    });
    await act(async () => root.render(createElement(BarcodeScan, { onFound })));

    // Simulate a photo result without accessing a camera or sending its image.
    const photo = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(photo, 'files', { value: [new File(['fictional'], 'barcode.jpg')] });
    await act(async () => photo.dispatchEvent(new Event('change', { bubbles: true })));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLInputElement>('#barcode-code')?.value).toBe('9556001234567');

    await act(async () => container.querySelector('form')!.requestSubmit());
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ code: '9556001234567' });
  });

  it('asks for the packet values when the database record conflicts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({}) }));
    await lookUp('9556001234567');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('conflicting nutrition values');
    expect(onFound).not.toHaveBeenCalled();
  });

  it('keeps an unknown label value unknown', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => REPLY }));
    await lookUp('9556001234567');
    expect(onFound.mock.calls[0]![0].nutrients.added_sugar_g).toBeNull();
  });

  it('marks the values as a label, and keeps where they were found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => REPLY }));
    await lookUp('9556001234567');
    expect(onFound.mock.calls[0]![0].source.kind).toBe('label');
    expect(onFound.mock.calls[0]![0].source.reference).toContain('Open Food Facts');
  });

  it('says what to do when the barcode is not known', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
    await lookUp('9556001234567');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('not in Open Food Facts');
    expect(onFound).not.toHaveBeenCalled();
  });

  it('asks for digits before calling anything', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await lookUp('abc');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('8 to 14 digits');
  });

  it('offers a label photo after a missing lookup and uploads it only after a tap', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    await lookUp('9556001234567');
    fetchMock.mockClear().mockResolvedValue({ ok: true, status: 200, json: async () => REPLY });

    // Choosing a file stays local until the explicit photo-reading action.
    const file = container.querySelector<HTMLInputElement>('details input[type="file"]')!;
    Object.defineProperty(file, 'files', { value: [new File(['fictional'], 'label.jpg')] });
    await act(async () => file.dispatchEvent(new Event('change', { bubbles: true })));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onFound).not.toHaveBeenCalled();

    const read = container.querySelector<HTMLButtonElement>('details button')!;
    await act(async () => read.click());
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/barcode/label');
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      code: '9556001234567', name: '', image: 'data:image/jpeg;base64,ZmFrZQ==',
    });
    expect(onFound).toHaveBeenCalledOnce();
  });

  it('hides the camera where the browser cannot read barcodes', () => {
    expect(container.textContent).not.toContain('Take a photo of the barcode');
    expect(container.textContent).toContain('Read a packet label with AI');
  });
});
