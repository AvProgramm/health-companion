import { useState, type ChangeEvent, type FormEvent } from 'react';
import { lookUpBarcode, readBarcodeDigits } from '../api/barcode';
import type { FoodVersion } from '../domain/nutrition/types';
import { errorText } from './useSave';

// The packaged-food barcode formats, which is all a nutrition lookup can use
const FOOD_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canScan = barcodeReader() !== null;

  /** Look up one barcode number and pass on what it finds. */
  async function lookUp(text: string) {
    setError(null);
    setBusy(true);
    try {
      onFound(await lookUpBarcode(readBarcodeDigits(text), crypto.randomUUID()));
      setCode('');
    } catch (problem) {
      setError(errorText(problem));
    } finally {
      setBusy(false);
    }
  }

  /** Read a barcode from a photo, on this device. */
  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const photo = event.target.files?.[0];
    event.target.value = '';
    const reader = barcodeReader();

    // Ignore a cancelled camera, because there is nothing to read
    if (photo === undefined || reader === null) return;
    setError(null);
    try {
      const found = await reader.detect(await createImageBitmap(photo));
      if (found[0] === undefined) {
        setError('No barcode found. Hold it flat and close, or type the number.');
        return;
      }
      setCode(found[0].rawValue);
      await lookUp(found[0].rawValue);
    } catch (problem) {
      setError(errorText(problem));
    }
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
        <input id="barcode-code" className="input" inputMode="numeric" autoComplete="off" aria-label="Barcode number" placeholder="Or type the number" style={{ flex: 1 }} value={code} onChange={event => setCode(event.target.value)} />
        <button type="submit" className="button button-secondary" disabled={busy}>{busy ? 'Looking…' : 'Look up'}</button>
      </form>
      <p className="hint">Only the barcode number is sent. You check the label values before anything is saved.</p>
      {error !== null && <p className="notice notice-error" role="alert">{error}</p>}
    </section>
  );
}
