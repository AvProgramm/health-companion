import { useEffect, useState } from 'react';
import { prepareAccount, signInGoogle, signOutAccount, type CloudIdentity } from '../../../api/firebaseAccount';
import { useBusy } from '../../hooks/useBusy';
import { ErrorLine } from '../shared/NoticeLine';

/** Offer Google sign-in while keeping migration status explicit. */
export function CloudAccount() {
  const [account, setAccount] = useState<CloudIdentity | null>(null);
  const [ready, setReady] = useState(false);
  const { busy, error, run } = useBusy();

  // Prepare the popup without sending diary records or signing in automatically.
  useEffect(() => {
    let active = true;
    void run(async () => {
      const identity = await prepareAccount();
      if (active) { setAccount(identity); setReady(true); }
    });
    return () => { active = false; };
  }, []);

  /** Sign in or out only after the corresponding button is tapped. */
  function changeAccount() {
    void run(async () => {
      if (account === null) setAccount(await signInGoogle());
      else { await signOutAccount(); setAccount(null); }
    });
  }

  return <section className="card" aria-labelledby="cloud-account-heading">
    <p className="eyebrow">YOUR CLOUD ACCOUNT</p>
    <h2 className="heading" id="cloud-account-heading">Connect with Google</h2>
    <p className="body">{account === null ? 'Sign in to prepare your personal cloud diary.' : `Signed in as ${account.displayName || 'your Google account'}.`}</p>
    <button type="button" className="button" disabled={busy || !ready} onClick={changeAccount}>{busy ? 'Connecting…' : account === null ? 'Sign in with Google' : 'Sign out'}</button>
    <ErrorLine error={error} />
    <p className="hint">Your diary has not been uploaded. Account connection and diary migration are separate steps.</p>
  </section>;
}
