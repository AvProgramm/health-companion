import { useState, type ChangeEvent, type FormEvent } from 'react';
import { lookUpBarcode, readPacketLabel } from '../../../data/api/barcode';
import { readBarcodeDigits } from '../../../domain/nutrition/barcodeDigits';
import type { FoodVersion } from '../../../domain/nutrition/types';
import { scanBarcode } from '../../../vision/scanBarcode';
import { shrinkPhoto } from '../../../vision/shrinkPhoto';
import { useBusy } from '../../hooks/useBusy';
import { ErrorLine } from '../shared/NoticeLine';
import { PacketLabelCapture } from './PacketLabelCapture';

// Preserve more detail for small printed nutrition values.
const LABEL_LONGEST_SIDE = 1280;

/**
 * Find a packaged food by its barcode, then hand it over for review.
 *
 * Three steps, each with one outcome the person can see: read the digits (on this device),
 * look the number up (only the number is sent), and, when the database does not hold the
 * product, read the packet's own label from a photo they choose to send. Nothing is saved
 * here: every result opens in the food editor to be checked first.
 */
export function BarcodeScan({ onFound }: { onFound: (food: FoodVersion) => void }) {
  const [code, setCode] = useState('');
  // Readings from a photo that the person still has to check against the packet
  const [scanChoices, setScanChoices] = useState<string[]>([]);
  // The number the database was asked about and did not hold
  const [missing, setMissing] = useState<string | null>(null);
  const { busy, error, run } = useBusy();
  const notFound = missing !== null && missing === code.replace(/\s/g, '');

  /** Use the digits chosen from the photo or typed from the packet. */
  function enterCode(digits: string) {
    setCode(digits);
    setScanChoices([]);
  }

  /** Read a barcode from a photo, on this device. */
  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const photo = event.target.files?.[0];
    event.target.value = '';

    // Ignore a cancelled camera, because there is nothing to read
    if (photo === undefined) return;
    enterCode('');
    let agreed: string | null = null;
    await run(async () => {
      const scan = await scanBarcode(photo);
      if (scan.kind === 'agreed') agreed = scan.digits;
      else setScanChoices(scan.digits);
    });

    // Look up digits both readers agree on straight away, so one photo is the whole step
    if (agreed !== null) await lookUp(agreed);
  }

  /** Look up one number, and remember it when nothing is known about it. */
  async function lookUp(text: string) {
    setCode(text);
    setScanChoices([]);
    await run(async () => {
      const digits = readBarcodeDigits(text);
      const food = await lookUpBarcode(digits, crypto.randomUUID());
      if (food === null) setMissing(digits);
      else onFound(food);
    });
  }

  /** Look up the number typed in the field. */
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void lookUp(code);
  }

  /** Send a redrawn label photo after the person asks to read it. */
  async function reviewPacket(photo: File, name: string) {
    await run(async () => {
      const digits = readBarcodeDigits(code);
      onFound(await readPacketLabel(digits, name, await shrinkPhoto(photo, LABEL_LONGEST_SIDE), crypto.randomUUID()));
    });
  }

  return (
    <section className="card ai-card" aria-labelledby="barcode-heading">
      <div><p className="eyebrow">PACKAGED FOOD</p><h2 id="barcode-heading" className="heading">Scan a barcode</h2></div>
      <label className="button plate-button">Take a photo of the barcode<input className="visually-hidden" type="file" accept="image/*" disabled={busy} onChange={handlePhoto} /></label>
      {scanChoices.length > 0 && (
        <fieldset className="fieldset">
          <legend className="label">Confirm the barcode</legend>
          <p className="hint">The photo could not be read with certainty. Tap the number printed below the bars to look it up, or type it.</p>
          <div className="row">
            {scanChoices.map((digits) => (
              <button key={digits} type="button" className="button button-secondary" onClick={() => void lookUp(digits)}>
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
      <p className="hint">Only the barcode number is sent. Two food databases are asked; if neither has a usable label, you get an estimate by the product's name to check against the packet.</p>
      {notFound && <p className="notice notice-conflict" role="status">Neither food database knows this barcode. Your packet's own label is the best source: read it below, or add the food by hand in Foods.</p>}
      <ErrorLine error={error} />
      <PacketLabelCapture key={code} open={notFound} barcodeReady={code.trim() !== ''} busy={busy} onRead={reviewPacket} />
    </section>
  );
}
