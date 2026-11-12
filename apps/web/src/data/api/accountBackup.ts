/**
 * The account-backup routes of the service: save, check, load and delete one copy of the diary.
 *
 * The copy belongs to the signed-in account, which the service reads from the session
 * cookie. Nothing here names an account, and a loaded backup is returned unread so the
 * caller must validate it before it can be restored.
 */
import { ServiceError } from './post';

// The one path every route here starts with
const BACKUP_PATH = '/api/account/backup';
// How long a status check or delete may take; both carry no diary
const SHORT_TIMEOUT_MS = 10_000;
// How long a save or load may take: longer, because the whole diary travels and a sleeping hosted service needs time to wake
const TRANSFER_TIMEOUT_MS = 60_000;

// What a missing backup says; the service answers 404 for it
const NO_BACKUP = 'No backup is saved for this account yet.';
// What a reply of the wrong shape says, for example a proxy's own page with status 200
const UNREADABLE = 'The account service sent a reply the app could not read. Try again.';
// What each failure means for the person waiting, by HTTP status
const STATUS_MESSAGES: Readonly<Record<number, string>> = {
  401: 'Sign in again to use your account backup.',
  404: NO_BACKUP,
  413: 'This diary is larger than the 5 MB an account backup can hold. Download a backup file instead.',
  // The preview proxy answers 502/504 when nothing is listening on the service port
  502: 'The account service is not running. Try again in a minute.',
  504: 'The account service is not running. Try again in a minute.',
};

/** When the account's backup was saved, and how large it is. */
export interface AccountBackupStatus {
  savedAt: string;
  sizeBytes: number;
}

/** A backup as the service returned it; `backup` is unchecked until validateBackup has read it. */
export interface LoadedAccountBackup extends AccountBackupStatus {
  backup: unknown;
}

/**
 * Store this backup as the account's only copy, and return when it was saved and its size.
 */
export async function saveAccountBackup(backup: unknown): Promise<AccountBackupStatus> {
  return statusFrom(await ask('PUT', BACKUP_PATH, TRANSFER_TIMEOUT_MS, { backup }));
}

/**
 * Return when the account's backup was saved, or null when it has none.
 *
 * A failing service throws instead, so the screen can tell "no backup" from "could not ask".
 */
export async function readAccountBackupStatus(): Promise<AccountBackupStatus | null> {
  const response = await ask('GET', `${BACKUP_PATH}/status`, SHORT_TIMEOUT_MS);
  return response.status === 404 ? null : statusFrom(response);
}

/**
 * Return the account's backup with its status, or throw when there is none.
 */
export async function loadAccountBackup(): Promise<LoadedAccountBackup> {
  const response = await ask('GET', BACKUP_PATH, TRANSFER_TIMEOUT_MS);
  const reply = await replyFrom(response);
  const status = readStatus(reply);

  // Ignore a reply without an object under `backup` because there is nothing to validate
  if (status === null || typeof reply.backup !== 'object' || reply.backup === null || Array.isArray(reply.backup)) {
    throw new Error(UNREADABLE);
  }
  return { ...status, backup: reply.backup };
}

/**
 * Remove the account's backup from the service.
 */
export async function deleteAccountBackup(): Promise<void> {
  const response = await ask('DELETE', BACKUP_PATH, SHORT_TIMEOUT_MS);
  if (!response.ok) {
    throw failure(response.status);
  }
}

/**
 * Send one request to a backup route with the session cookie, or throw why it never arrived.
 */
async function ask(method: 'GET' | 'PUT' | 'DELETE', path: string, timeoutMs: number, body?: unknown): Promise<Response> {
  try {
    return await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (problem) {
    // AbortSignal.timeout rejects with a TimeoutError; anything else means no connection
    const slow = problem instanceof DOMException && problem.name === 'TimeoutError';
    throw new Error(slow ? 'The account service took too long to answer. Try again.' : 'Could not reach the account service. Check the connection, then try again.');
  }
}

/**
 * Return the error for a failed reply, keeping its status so a screen can react to it.
 */
function failure(status: number): ServiceError {
  const fallback = status >= 500 ? 'The account service could not complete this. Try again in a minute.' : `The account service answered with status ${status}. Try again.`;
  return new ServiceError(STATUS_MESSAGES[status] ?? fallback, status);
}

/**
 * Return the JSON object in a successful reply, or throw what the reply means.
 */
async function replyFrom(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) {
    throw failure(response.status);
  }

  // Check the shape before trusting it, because a proxy can answer 200 with a page of its own
  const reply: unknown = await response.json().catch(() => null);
  if (typeof reply !== 'object' || reply === null) {
    throw new Error(UNREADABLE);
  }
  return reply as Record<string, unknown>;
}

/**
 * Return the status in a successful reply, or throw what the reply means.
 */
async function statusFrom(response: Response): Promise<AccountBackupStatus> {
  const status = readStatus(await replyFrom(response));
  if (status === null) {
    throw new Error(UNREADABLE);
  }
  return status;
}

/**
 * Return the saved time and size in a reply, or null when either is not a real value.
 *
 * Only the two known fields are kept, so nothing else in the reply travels with the status.
 */
function readStatus(reply: Record<string, unknown>): AccountBackupStatus | null {
  const { savedAt, sizeBytes } = reply;

  // Ignore a time the browser cannot read because the card would show "Invalid Date"
  if (typeof savedAt !== 'string' || Number.isNaN(Date.parse(savedAt))) {
    return null;
  }
  // Check finiteness before range, because NaN slips past a comparison
  if (typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return null;
  }
  return { savedAt, sizeBytes };
}
