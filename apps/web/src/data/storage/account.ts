/**
 * What this device remembers about accounts: who last signed in, and whose diary is whose.
 *
 * Only an id and an email are kept, never a password or a session token. The diaries
 * themselves stay in IndexedDB; this file only decides which one an account opens.
 */
import { readAccount, type Account } from '../../domain/account/account';
import { DIARY_NAME } from './connection';

// The last account that signed in here, so the diary still opens when the service cannot be asked
const ACCOUNT_KEY = 'health-companion:account';
// The id of the account that owns the diary this device had before accounts existed
const DIARY_OWNER_KEY = 'health-companion:diary-owner';

/**
 * Return the account last signed in on this device, or null.
 */
export function readRememberedAccount(): Account | null {
  try {
    return readAccount(JSON.parse(localStorage.getItem(ACCOUNT_KEY) ?? 'null'));
  } catch {
    // Ignore a blocked or damaged storage because an unknown account must be treated as nobody
    return null;
  }
}

/**
 * Remember the signed-in account's id and email on this device.
 */
export function rememberAccount(account: Account): void {
  try {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ id: account.id, email: account.email }));
  } catch {
    // Ignore a blocked storage because the session cookie still signs the person in while online
  }
}

/**
 * Forget the remembered account, leaving every diary and its owner untouched.
 */
export function forgetAccount(): void {
  try {
    localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    // Ignore a blocked storage because there is then nothing remembered to remove
  }
}

/**
 * Return the name of the diary database this account opens, claiming the existing diary if it is free.
 *
 * The first account to sign in on a device keeps the diary that was already here, under
 * its original name. Any other account gets a database of its own, so two people on one
 * browser never read each other's diary. Nothing is ever renamed or deleted.
 */
export function claimDiaryName(accountId: string): string {
  const ownDiaryName = `${DIARY_NAME}:${accountId}`;
  try {
    // Open the existing diary for its recorded owner
    const ownerId = localStorage.getItem(DIARY_OWNER_KEY);
    if (ownerId !== null) {
      return ownerId === accountId ? DIARY_NAME : ownDiaryName;
    }

    // Record the first account as the owner before handing the existing diary over
    localStorage.setItem(DIARY_OWNER_KEY, accountId);
    return DIARY_NAME;
  } catch {
    // Ignore a blocked storage because, with no record of the owner, the existing diary must not be shown to a guess
    return ownDiaryName;
  }
}
