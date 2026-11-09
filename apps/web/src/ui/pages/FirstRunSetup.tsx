import { useRef, useState } from 'react';
import { Leaf } from '@phosphor-icons/react';
import type { BodyFacts } from '../../domain/profile/body';
import { BodyFactsForm } from '../components/me/BodyFactsForm';
import { errorText } from '../format';
import { ErrorLine } from '../components/shared/NoticeLine';

interface FirstRunSetupProps {
  hideNumbers: boolean;
  currentYear: number;
  onSave: (body: BodyFacts, operationKey: string) => Promise<void>;
  onRestoreInstead: () => void;
}

/**
 * The first screen of a new diary: nothing else opens until height and weight are saved.
 *
 * Food and training cannot be balanced without them. There is no account, so this stays
 * on the device. Someone moving to a new phone can restore a backup instead.
 */
export function FirstRunSetup({ hideNumbers, currentYear, onSave, onRestoreInstead }: FirstRunSetupProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key for this setup, so a retried save is recognised as the same one
  const operationKey = useRef(crypto.randomUUID());

  /** Save the facts, leaving the screen open with the reason if that fails. */
  async function save(body: BodyFacts) {
    setSaving(true);
    setError(null);
    try {
      await onSave(body, operationKey.current);
    } catch (problem) {
      setError(errorText(problem));
      setSaving(false);
    }
  }

  return (
    <main className="signup-page">
      <section className="signup-card" aria-labelledby="signup-heading">
        <div className="signup-brand"><span className="brand-mark"><Leaf size={24} weight="bold" /></span><span className="brand-name">Health Companion</span><span className="signup-tagline">A little balance, every day.</span></div>
        <h1 id="signup-heading" className="signup-title">Set up your profile</h1>
        <p className="signup-intro">Your height and weight let the app balance your food and training. There is no account, and this stays on this device.</p>
        <ErrorLine error={error} />
        <BodyFactsForm initial={null} hideNumbers={hideNumbers} currentYear={currentYear} saving={saving} submitLabel="Save and continue" onSubmit={save}>
          <button type="button" className="signup-pill signup-pill-secondary" disabled={saving} onClick={onRestoreInstead}>Restore a backup</button>
        </BodyFactsForm>
      </section>
    </main>
  );
}
