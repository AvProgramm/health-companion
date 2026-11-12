import { useBusy } from '../../hooks/useBusy';
import { ErrorLine } from '../shared/NoticeLine';

interface AccountCardProps {
  email: string;
  // True when the service could not confirm the session, so this is the account the device remembers
  offline: boolean;
  onSignOut: () => Promise<void>;
}

/**
 * Display who is signed in, with the way to sign out.
 *
 * Signing out ends the session only. The diary stays on the device, which the card
 * says before the button is pressed.
 */
export function AccountCard({ email, offline, onSignOut }: AccountCardProps) {
  const { busy, error, run } = useBusy();

  return (
    <section className="card" aria-labelledby="account-heading">
      <h2 id="account-heading" className="heading">Account</h2>
      <p className="body">Signed in as {email}.</p>
      {offline && <p className="hint">The sign-in service could not be reached, so this is the account last used on this device.</p>}
      <p className="hint">Signing out keeps your diary on this device. Sign in with the same account to open it again.</p>
      <ErrorLine error={error} />
      <div className="row">
        <button type="button" className="button button-secondary" disabled={busy} onClick={() => run(onSignOut)}>{busy ? 'Signing out…' : 'Sign out'}</button>
      </div>
    </section>
  );
}
