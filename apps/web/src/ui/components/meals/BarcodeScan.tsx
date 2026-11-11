import { useState, type ChangeEvent, type FormEvent } from 'react';
import { lookUpBarcode, readBarcodeDigits, readPacketLabel } from '../../../data/api/barcode';
import type { FoodVersion } from '../../../domain/nutrition/types';
import { useBusy } from '../../hooks/useBusy';
import { ErrorLine } from '../shared/NoticeLine';
import { shrinkPhoto } from '../../../vision/shrinkPhoto';
import { PacketLabelCapture } from './PacketLabelCapture';

// The packaged-food barcode formats, which is all a nutrition lookup can use
const FOOD_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
// Preserve more detail for small printed nutrition values.
const LABEL_LONGEST_SIDE = 1280;

/** The part of the browser's barcode reader this card uses; it exists on Android Chrome. */
interface BarcodeReader {
  detect: (image: ImageBitmap) => Promise<{ rawValue: string }[]>;
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
export function BarcodeScan({ onFound }: { onFound: (food: FoodVersion) => void }) {
  const [code, setCode] = useState('');
  const [lastProduct, setLastProduct] = useState<{ code: string; name: string } | null>(null);
  const { busy, error, run } = useBusy();
  const canScan = barcodeReader() !== null;

  /** Look up one barcode number and pass on what it finds. */
  async function lookUp(text: string) {
    await run(async () => {
      const digits = readBarcodeDigits(text);
      const food = await lookUpBarcode(digits, crypto.randomUUID());
      setLastProduct({ code: digits, name: food.name });
      onFound(food);
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
    await run(async () => {
      // Decode on the device and release the photo once its digits have been read.
      const bitmap = await createImageBitmap(photo);
      const found = await reader.detect(bitmap).finally(() => bitmap.close());
      const numbers = [...new Set(found.map((item) => item.rawValue.trim()))];
      if (numbers.length === 0) throw new Error('No barcode found. Hold it flat and close, or type the number.');
      if (numbers.length > 1) throw new Error('More than one barcode was found. Frame one code, or type its number.');

      // Let the person confirm the digits before sending any lookup.
      setCode(readBarcodeDigits(numbers[0]!));
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

  /** Look up the number that was typed. */
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void lookUp(code);
  }

  return (
    <section className="card ai-card" aria-labelledby="barcode-heading">
      <div><p className="eyebrow">PACKAGED FOOD</p><h2 id="barcode-heading" className="heading">Scan a barcode</h2></div>
      {canScan && <label className="button plate-button">Take a photo of the barcode<input className="visually-hidden" type="file" accept="image/*" disabled={busy} onChange={handlePhoto} /></label>}
      <form className="row" onSubmit={handleSubmit}>
        <input id="barcode-code" className="input" inputMode="numeric" autoComplete="off" aria-label="Barcode number" disabled={busy} placeholder="Or type the number" style={{ flex: 1 }} value={code} onChange={event => setCode(event.target.value)} />
        <button type="submit" className="button button-secondary" disabled={busy}>{busy ? 'Looking…' : 'Look up'}</button>
      </form>
      <p className="hint">Check the digits against the packet before tapping Look up. Only the barcode number is sent. Compare any result with the packet label.</p>
      <PacketLabelCapture key={code} barcodeReady={code.trim() !== ''} busy={busy}
        knownName={lastProduct?.code === code.replace(/\s/g, '') ? lastProduct.name : ''} onRead={reviewPacket} />
      <ErrorLine error={error} />
    </section>
  );
}
