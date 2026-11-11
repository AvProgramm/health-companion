import { useState, type ChangeEvent, type FormEvent } from 'react';
import { lookUpBarcode, readBarcodeDigits, readPacketLabel } from '../../../data/api/barcode';
import type { FoodVersion } from '../../../domain/nutrition/types';
import { useBusy } from '../../hooks/useBusy';
import { ErrorLine } from '../shared/NoticeLine';
import { confirmBarcode } from '../../../vision/confirmBarcode';
import { shrinkPhoto } from '../../../vision/shrinkPhoto';
import { PacketLabelCapture } from './PacketLabelCapture';

// The packaged-food barcode formats, which is all a nutrition lookup can use
const FOOD_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
// Preserve more detail for small printed nutrition values.
const LABEL_LONGEST_SIDE = 1280;

/** The part of the browser's barcode reader this card uses; it exists on Android Chrome. */
interface BarcodeReader {
  detect: (image: ImageBitmap) => Promise<{ rawValue: string; boundingBox?: DOMRectReadOnly }[]>;
}

/** Return the browser's on-device barcode reader, or null where there is none. */
function barcodeReader(): BarcodeReader | null {
  const Reader = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => BarcodeReader }).BarcodeDetector;
  return Reader === undefined ? null : new Reader({ formats: FOOD_FORMATS });
}

/**
 * Find a packaged food by its barcode, then hand it over for review.
 *
 * The barcode is read on the device and only its number is looked up. Nothing is saved
 * here: the label values open in the food editor to be checked first.
 */
export function BarcodeScan({ onFound }: { onFound: (food: FoodVersion, reviewNote?: string) => void }) {
  const [code, setCode] = useState('');
  const [scanChoices, setScanChoices] = useState<string[]>([]);
  const [lastProduct, setLastProduct] = useState<{ code: string; name: string } | null>(null);
  const { busy, error, run } = useBusy();
  const canScan = barcodeReader() !== null;

  /** Look up one barcode number and pass on what it finds. */
  async function lookUp(text: string) {
    await run(async () => {
      const digits = readBarcodeDigits(text);
      const { food, reviewNote } = await lookUpBarcode(digits, crypto.randomUUID());
      setLastProduct({ code: digits, name: food.name });
      onFound(food, reviewNote);
    });
  }

  /** Read a barcode from a photo, on this device. */
  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const photo = event.target.files?.[0];
    event.target.value = '';
    const reader = barcodeReader();

    // Ignore a cancelled camera, because there is nothing to read
    if (photo === undefined || reader === null) return;
    setCode('');
    setScanChoices([]);
    await run(async () => {
      // Decode on the device and release the photo once its digits have been read.
      const bitmap = await createImageBitmap(photo);
      try {
        const found = await reader.detect(bitmap);
        const numbers = [...new Set(found.map((item) => item.rawValue.trim()))];
        if (numbers.length > 1) throw new Error('More than one barcode was found. Frame one code, or type its number.');

        // Keep a single reading available for review because either reader can miss a clear barcode.
        const native = numbers[0];
        const checked = await confirmBarcode(bitmap, found[0]?.boundingBox);
        if (native === undefined && checked === null) {
          throw new Error('Could not read the barcode. Try another photo or type the number printed below the bars.');
        }

        // Fill agreed digits. Ask the person to select a printed match if the readers disagree.
        if (native !== undefined && checked !== null && checked.padStart(14, '0') === native.padStart(14, '0')) {
          setCode(readBarcodeDigits(native));
          return;
        }
        setScanChoices([checked, ...numbers].filter((value) => value !== null).map(readBarcodeDigits));
      } finally {
        bitmap.close();
      }
    });
  }

  /** Send a redrawn label photo after the person asks to read it. */
  async function reviewPacket(photo: File, name: string) {
    await run(async () => {
      const digits = readBarcodeDigits(code);
      const image = await shrinkPhoto(photo, LABEL_LONGEST_SIDE);
      onFound(await readPacketLabel(digits, name, image, crypto.randomUUID()));
    });
  }

  /** Use the digits chosen from the photo or typed from the packet. */
  function enterCode(digits: string) {
    setCode(digits);
    setScanChoices([]);
  }

  /** Look up the number entered in the field. */
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void lookUp(code);
  }

  return (
    <section className="card ai-card" aria-labelledby="barcode-heading">
      <div><p className="eyebrow">PACKAGED FOOD</p><h2 id="barcode-heading" className="heading">Scan a barcode</h2></div>
      {canScan && <label className="button plate-button">Take a photo of the barcode<input className="visually-hidden" type="file" accept="image/*" disabled={busy} onChange={handlePhoto} /></label>}
      {scanChoices.length > 0 && (
        <fieldset className="fieldset">
          <legend className="label">Confirm the barcode</legend>
          <p className="hint">Choose the number printed below the bars, or type it in the barcode field.</p>
          <div className="row">
            {scanChoices.map((digits) => (
              <button key={digits} type="button" className="button button-secondary" onClick={() => enterCode(digits)}>
                Use {digits}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <form className="row" onSubmit={handleSubmit}>
        <input id="barcode-code" className="input" inputMode="numeric" autoComplete="off" aria-label="Barcode number" disabled={busy} placeholder="Or type the number" style={{ flex: 1 }} value={code} onChange={event => enterCode(event.target.value)} />
        <button type="submit" className="button button-secondary" disabled={busy || scanChoices.length > 0}>{busy ? 'Looking…' : 'Look up'}</button>
      </form>
      <p className="hint">Check the digits against the packet before tapping Look up. Only the barcode number is sent. Compare any result with the packet label.</p>
      <PacketLabelCapture key={code} barcodeReady={code.trim() !== ''} busy={busy}
        knownName={lastProduct?.code === code.replace(/\s/g, '') ? lastProduct.name : ''} onRead={reviewPacket} />
      <ErrorLine error={error} />
    </section>
  );
}
