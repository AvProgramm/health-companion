import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { browserPopupRedirectResolver, GoogleAuthProvider, inMemoryPersistence, initializeAuth, signInWithPopup, signOut, type Auth } from 'firebase/auth';

/** Identify the account verified by the laptop service. */
export interface CloudIdentity { uid: string; displayName: string }

// Keep authentication in memory; no diary or session token is written to browser storage.
let auth: Auth | null = null;
let preparing: Promise<Auth> | null = null;

/** Initialise Firebase once using only the public configuration endpoint. */
async function prepareAuth(): Promise<Auth> {
  if (auth !== null) return auth;
  if (preparing !== null) return preparing;
  preparing = (async () => {
    const response = await fetch('/api/firebase/config', { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Firebase is not ready. Check the laptop settings and restart the service.');
    const value = await response.json() as Record<string, unknown>;
    const fields = ['apiKey', 'projectId', 'authDomain', 'appId'] as const;
    if (!fields.every(key => typeof value[key] === 'string' && value[key] !== '')) throw new Error('Firebase returned incomplete app settings.');
    const config = Object.fromEntries(fields.map(key => [key, value[key]])) as FirebaseOptions;
    auth = initializeAuth(initializeApp(config, 'health-companion-cloud'), {
      persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver,
    });
    return auth;
  })();
  try { return await preparing; } finally { preparing = null; }
}

/** Ask the laptop to validate the signed-in Firebase account. */
async function verifyAccount(client: Auth): Promise<CloudIdentity | null> {
  const user = client.currentUser;
  if (user === null) return null;
  const response = await fetch('/api/firebase/account', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
    credentials: 'omit', cache: 'no-store', body: '{}', signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error('The laptop could not verify your account. Try signing in again.');
  const value = await response.json() as Partial<CloudIdentity>;
  if (value.uid !== user.uid || typeof value.displayName !== 'string') throw new Error('The account reply did not match your sign-in. Sign out and try again.');
  return { uid: value.uid, displayName: value.displayName };
}

/** Prepare the popup before a button tap, and return the current verified account. */
export async function prepareAccount(): Promise<CloudIdentity | null> {
  return verifyAccount(await prepareAuth());
}

/** Open Google sign-in only from the person's explicit button tap. */
export async function signInGoogle(): Promise<CloudIdentity> {
  // Ignore an early click because popup preparation must finish before authentication.
  if (auth === null) throw new Error('Wait for Firebase setup to finish, then try again.');
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
    const account = await verifyAccount(auth);
    if (account === null) throw new Error('No signed-in account was returned.');
    return account;
  } catch {
    await signOut(auth);
    throw new Error('Google sign-in did not finish. Enable Google in Firebase Authentication, authorise this app domain, and allow the sign-in popup.');
  }
}

/** Clear the in-memory Firebase session on explicit sign-out. */
export async function signOutAccount(): Promise<void> {
  if (auth !== null) await signOut(auth);
}
