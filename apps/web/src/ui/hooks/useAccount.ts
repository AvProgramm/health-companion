import { useCallback, useEffect, useState } from 'react';
import * as authApi from '../../data/api/auth';
import { claimDiaryName, forgetAccount, readRememberedAccount, rememberAccount } from '../../data/storage/account';
import type { Account } from '../../domain/account/account';
import { errorText } from '../format';

/** Who is using the app right now, as far as it can tell. */
export type AccountState =
  | { status: 'loading' }
  // `problem` says why the service could not be asked, when that is the reason for this screen
  | { status: 'signedOut'; problem: string | null }
  // `offline` means the service could not confirm the session, so the remembered account carries on
  | { status: 'signedIn'; account: Account; diaryName: string; offline: boolean };

/**
 * Return who is signed in, and the actions that change it.
 *
 * The session lives in a cookie only the service can read, so the app asks once on
 * load. A device that cannot ask keeps working for the account it remembers, because
 * the diary must open offline.
 */
export function useAccount() {
  const [state, setState] = useState<AccountState>({ status: 'loading' });
  // Bumped by Try again, so the session is asked for once more
  const [attempt, setAttempt] = useState(0);

  // Ask the service who is signed in, once per load and once per retry
  useEffect(() => {
    let cancelled = false;
    resolveSession().then((next) => {
      // Ignore an answer for a screen that has gone because a newer request replaces it
      if (!cancelled) {
        setState(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  /** Ask for the session again after the service could not be reached. */
  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((count) => count + 1);
  }, []);

  /** Sign in to an existing account, throwing the reason if the service refuses. */
  const signIn = useCallback(async (email: string, password: string) => {
    setState(enter(await authApi.signIn(email, password)));
  }, []);

  /** Create an account and enter it, throwing the reason if the service refuses. */
  const signUp = useCallback(async (email: string, password: string) => {
    setState(enter(await authApi.signUp(email, password)));
  }, []);

  /**
   * End the session and return to the sign-in screen, keeping the diary on the device.
   *
   * A failed request throws and changes nothing: the cookie would still be valid, so
   * saying "signed out" would not be true.
   */
  const signOut = useCallback(async () => {
    await authApi.signOut();
    forgetAccount();
    setState({ status: 'signedOut', problem: null });
  }, []);

  return { state, retry, signIn, signUp, signOut };
}

/**
 * Return the state the app should open in, from the service's answer or the lack of one.
 */
async function resolveSession(): Promise<AccountState> {
  let account: Account | null;
  try {
    account = await authApi.readSession();
  } catch (problem) {
    // Carry on as the remembered account when the service cannot be asked, so the diary opens offline
    const remembered = readRememberedAccount();
    return remembered === null ? { status: 'signedOut', problem: errorText(problem) } : signedIn(remembered, true);
  }

  // The service says nobody is signed in: forget the account, and leave its diary where it is
  if (account === null) {
    forgetAccount();
    return { status: 'signedOut', problem: null };
  }
  return enter(account);
}

/**
 * Remember a confirmed account on this device and return its signed-in state.
 */
function enter(account: Account): AccountState {
  rememberAccount(account);
  return signedIn(account, false);
}

/**
 * Return the signed-in state for an account, with the diary it opens on this device.
 */
function signedIn(account: Account, offline: boolean): AccountState {
  return { status: 'signedIn', account, diaryName: claimDiaryName(account.id), offline };
}
