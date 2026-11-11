import { useState, type ChangeEvent } from 'react';
import { Field } from '../shared/Field';

interface PacketLabelCaptureProps {
  // Opened for the person when a lookup found nothing, because this is then the next step
  open: boolean;
  barcodeReady: boolean;
  busy: boolean;
  onRead: (photo: File, name: string) => Promise<void>;
}

/**
 * Ask for a photo of the packet's nutrition panel, and wait for a separate tap before sending it.
 *
 * Choosing the photo keeps it on the device. Only "Read label with AI" sends a small copy,
 * and what comes back is a draft to compare with the packet, never a saved food.
 */
export function PacketLabelCapture({ open, barcodeReady, busy, onRead }: PacketLabelCaptureProps) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [name, setName] = useState('');

  /** Keep the chosen file local until the person taps Read label with AI. */
  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (chosen !== undefined) setPhoto(chosen);
  }

  return (
    <details className="manual-options" open={open || undefined}>
      <summary>Read the packet label with AI</summary>
      <p className="hint">1. Choose a clear photo of this packet's nutrition panel. 2. Tap Read label with AI, which sends a small copy of that photo. 3. Compare every value with the packet before saving.</p>
      {!barcodeReady && <p className="hint">Enter the barcode digits first.</p>}
      <label className="button button-secondary">
        {photo === null ? 'Choose nutrition label photo' : 'Change nutrition label photo'}
        <input className="visually-hidden" type="file" accept="image/*" disabled={busy} onChange={choosePhoto} />
      </label>
      <Field label="Product name" hint="Needed only when the name is not on the photo.">
        <input className="input" value={name} maxLength={80} disabled={busy} onChange={(event) => setName(event.target.value)} />
      </Field>
      <button type="button" className="button" disabled={!barcodeReady || photo === null || busy}
        onClick={() => { if (photo !== null) void onRead(photo, name.trim()); }}>
        {busy && photo !== null ? 'Reading the label…' : 'Read label with AI'}
      </button>
    </details>
  );
}
