import { useRef, useState } from 'react';
import type { BodyFacts } from '../domain/profile/body';
import type { Profile, ProfileSnapshot } from '../domain/profile/profile';
import { BodyFactsForm, BodyNumbers } from './BodyFactsForm';
import { errorText } from './useSave';

interface BodyCardProps {
  snapshot: ProfileSnapshot | null;
  hideNumbers: boolean;
  currentYear: number;
  onSave: (profile: Profile, operationKey: string, expectedVersion: number) => Promise<void>;
}

/**
 * Display height, weight and what they work out to, and let them be updated.
 *
 * Saving adds a new version of the profile, so earlier weights stay in its history.
 */
export function BodyCard({ snapshot, hideNumbers, currentYear, onSave }: BodyCardProps) {
  const body = snapshot?.value.body ?? null;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Kept until a save succeeds, so a retry is recognised as the same change
  const operationKey = useRef(crypto.randomUUID());

  /** Save the new facts as the next profile version, keeping every other setting. */
  async function save(next: BodyFacts) {
    // Ignore a save with no profile loaded, because there is nothing to add a version to
    if (snapshot === null) return;
    setSaving(true);
    setMessage(null);
    try {
      await onSave({ ...snapshot.value, body: next }, operationKey.current, snapshot.version);
      operationKey.current = crypto.randomUUID();
      setEditing(false);
      setMessage('Saved on this device.');
    } catch (problem) {
      setMessage(errorText(problem));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card" aria-labelledby="body-heading">
      <div className="card-head">
        <div><p className="eyebrow">ONLY ON THIS DEVICE</p><h2 className="heading" id="body-heading">Your body</h2></div>
        {!editing && <button type="button" className="button button-secondary" onClick={() => { setEditing(true); setMessage(null); }}>Update</button>}
      </div>
      {editing ? <BodyFactsForm initial={body} hideNumbers={hideNumbers} currentYear={currentYear} saving={saving} submitLabel="Save" onSubmit={save}>
        <button type="button" className="signup-pill signup-pill-secondary" disabled={saving} onClick={() => setEditing(false)}>Cancel</button>
      </BodyFactsForm> : body === null ? <p className="hint">Add your height and weight.</p> : <>
        <p className="body numbers">{body.heightCm} cm · {hideNumbers ? 'weight hidden' : `${body.weightKg} kg`}</p>
        {!hideNumbers && <BodyNumbers body={body} currentYear={currentYear} />}
      </>}
      {message !== null && <p className="notice" role="status">{message}</p>}
    </section>
  );
}
