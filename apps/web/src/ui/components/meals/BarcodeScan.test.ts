// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readBarcodeDigits } from '../../../domain/nutrition/barcodeDigits';
import { confirmBarcode } from '../../../vision/confirmBarcode';
import { BarcodeScan } from './BarcodeScan';

vi.mock('../../../vision/confirmBarcode', () => ({ confirmBarcode: vi.fn() }));

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

  it('shows agreed scan digits before looking up the product', async () => {
    vi.mocked(confirmBarcode).mockResolvedValueOnce('9556001234567');
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

  it.each([
    { native: '9310947048982', checked: '9310947004582', chosen: '9310947004582' },
    { native: '9310947048982', checked: null, chosen: '9310947048982' },
    { native: null, checked: '9310947004582', chosen: '9310947004582' },
  ])('lets the person check a scan before lookup when the two readers do not agree', async ({ native, checked, chosen }) => {
    vi.mocked(confirmBarcode).mockResolvedValueOnce(checked);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => REPLY });
    vi.stubGlobal('fetch', fetchMock);
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ close }));
    vi.stubGlobal('BarcodeDetector', class {
      detect = vi.fn().mockResolvedValue(native === null ? [] : [{ rawValue: native }]);
    });
    await act(async () => root.render(createElement(BarcodeScan, { onFound })));

    // Observed on the phone on 11 Nov. Both numbers pass the EAN checksum.
    const photo = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(photo, 'files', { value: [new File(['fictional'], 'barcode.jpg')] });
    await act(async () => photo.dispatchEvent(new Event('change', { bubbles: true })));
    const field = container.querySelector<HTMLInputElement>('#barcode-code')!;
    expect(field.value).toBe('');
    expect(close).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();

    // The displayed choice must be explicitly confirmed before it fills the field.
    const choice = [...container.querySelectorAll('button')].find(button => button.textContent === `Use ${chosen}`);
    expect(choice).toBeDefined();
    if (native !== null && checked !== null) expect(container.textContent).toContain(native);
    await act(async () => choice!.click());
    expect(field.value).toBe(chosen);
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => container.querySelector('form')!.requestSubmit());
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ code: chosen });
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

  it('treats a barcode the database does not hold as the next step, not an error', async () => {
    // Seen on the phone on 11 Nov with a spread sold in Australia: correct digits, then a dead-end error
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
    expect(container.querySelector('details')?.open).toBe(false);
    await lookUp('9310947004582');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toContain('not in the food database');
    expect(container.querySelector('details')?.open).toBe(true);
    expect(onFound).not.toHaveBeenCalled();
  });

  it('forgets the miss as soon as the digits change', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
    await lookUp('9310947004582');
    const field = container.querySelector<HTMLInputElement>('#barcode-code')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, '9310947004583');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('says the database could not be asked, which is different from a miss', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }));
    await lookUp('9310947004582');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('could not be reached just now');
    expect(container.querySelector('[role="status"]')).toBeNull();
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

  it.each([
    ['has no barcode reader of its own', undefined],
    ['has a reader that throws', class { detect = vi.fn().mockRejectedValue(new Error('Fictional reader failure')); }],
  ])('still scans with the bundled reader where the browser %s, and asks the person to confirm', async (_case, Detector) => {
    vi.mocked(confirmBarcode).mockResolvedValueOnce('9310947004582');
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ close: vi.fn() }));
    if (Detector !== undefined) vi.stubGlobal('BarcodeDetector', Detector);
    const photo = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(photo, 'files', { value: [new File(['fictional'], 'barcode.jpg')] });
    await act(async () => photo.dispatchEvent(new Event('change', { bubbles: true })));
    expect(container.querySelector<HTMLInputElement>('#barcode-code')?.value).toBe('');
    expect([...container.querySelectorAll('button')].some(button => button.textContent === 'Use 9310947004582')).toBe(true);
  });

  it('says what to do when neither reader can read the photo', async () => {
    vi.mocked(confirmBarcode).mockResolvedValueOnce(null);
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ close: vi.fn() }));
    const photo = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(photo, 'files', { value: [new File(['fictional'], 'barcode.jpg')] });
    await act(async () => photo.dispatchEvent(new Event('change', { bubbles: true })));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('type the number printed below the bars');
  });

  it('ignores a reading that is not a barcode number', async () => {
    vi.mocked(confirmBarcode).mockResolvedValueOnce('9310947004582');
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ close: vi.fn() }));
    vi.stubGlobal('BarcodeDetector', class { detect = vi.fn().mockResolvedValue([{ rawValue: 'https://example.org/qr' }]); });
    const photo = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(photo, 'files', { value: [new File(['fictional'], 'barcode.jpg')] });
    await act(async () => photo.dispatchEvent(new Event('change', { bubbles: true })));
    expect([...container.querySelectorAll('button')].filter(button => button.textContent?.startsWith('Use ')).map(button => button.textContent)).toEqual(['Use 9310947004582']);
  });
});
