import { useState, type ChangeEvent } from 'react';
import { Field } from '../shared/Field';

interface PacketLabelCaptureProps {
  barcodeReady: boolean;
  busy: boolean;
  knownName: string;
  onRead: (photo: File, name: string) => Promise<void>;
}

/** Ask for a label photo and wait for a separate tap before uploading it. */
export function PacketLabelCapture({ barcodeReady, busy, knownName, onRead }: PacketLabelCaptureProps) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [name, setName] = useState('');

  /** Keep the chosen file local until the user taps Read label with AI. */
  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (chosen !== undefined) setPhoto(chosen);
  }

  return (
    <details className="manual-options">
      <summary>Read a packet label with AI</summary>
      <p className="hint">For missing or conflicting values, choose a clear photo of this packet’s nutrition panel.
        A small copy of the photo goes to hosted AI when you tap Read label with AI.</p>
      {!barcodeReady && <p className="hint">Enter the barcode digits first.</p>}
      <Field label="Product name (optional)">
        <input className="input" value={name} placeholder={knownName || 'Enter if it is not on the photo'}
          maxLength={80} disabled={busy} onChange={(event) => setName(event.target.value)} />
      </Field>
      <label className="button button-secondary">
        {photo === null ? 'Choose nutrition label photo' : 'Change nutrition label photo'}
        <input className="visually-hidden" type="file" accept="image/*" disabled={busy} onChange={choosePhoto} />
      </label>
      <button type="button" className="button" disabled={!barcodeReady || photo === null || busy}
        onClick={() => { if (photo !== null) void onRead(photo, name.trim() || knownName); }}>
        Read label with AI
      </button>
    </details>
  );
}
