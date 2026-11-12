/**
 * The sign-in routes of the service: sign up, sign in, read the session, sign out.
 *
 * The session is an HttpOnly cookie the browser keeps, so this code never sees a token
 * and never stores one. Only the email and password the person typed are sent.
 */
import { readAccount, type Account } from '../../domain/account/account';
import { ServiceError } from './post';

// How long the opening session check may take before the app carries on without it
const SESSION_TIMEOUT_MS = 8_000;
// How long a typed sign-in may take: longer, because a sleeping hosted service needs time to wake
const SIGN_IN_TIMEOUT_MS = 30_000;
// The longest explanation from the service that is shown as it is
const DETAIL_MAX_LENGTH = 200;

// What a refused form says when the service gave no short reason of its own
const INVALID_SIGN_UP = 'Check the email and password, then try again.';
const INVALID_SIGN_IN = 'Check the email address, then try again.';

// What each failure means for the person waiting, by HTTP status
const STATUS_MESSAGES: Readonly<Record<number, string>> = {
  401: 'Email or password is incorrect.',
  409: 'An account with this email already exists. Sign in instead.',
  429: 'Too many attempts. Wait a few minutes and try again.',
  // The preview proxy answers 502/504 when nothing is listening on the service port
  502: 'The sign-in service is not running. Try again in a minute.',
  503: 'Sign-in is not set up on the service yet. Try again later.',
  504: 'The sign-in service is not running. Try again in a minute.',
};

/**
 * Create an account and return it, already signed in.
 */
export async function signUp(email: string, password: string): Promise<Account> {
  return accountFrom(await ask('/api/auth/signup', 'POST', SIGN_IN_TIMEOUT_MS, { email, password }), INVALID_SIGN_UP);
}

/**
 * Sign in to an existing account and return it.
 */
export async function signIn(email: string, password: string): Promise<Account> {
  return accountFrom(await ask('/api/auth/signin', 'POST', SIGN_IN_TIMEOUT_MS, { email, password }), INVALID_SIGN_IN);
}

/**
 * Return the signed-in account, or null when nobody is signed in.
 *
 * A request that never arrives, or a failing service, throws instead: the caller must be
 * able to tell "signed out" from "could not ask", or going offline would sign people out.
 */
export async function readSession(): Promise<Account | null> {
  const response = await ask('/api/auth/session', 'GET', SESSION_TIMEOUT_MS);
  return response.status === 401 ? null : accountFrom(response, INVALID_SIGN_IN);
}

/**
 * End the session on the service, which clears the cookie.
 */
export async function signOut(): Promise<void> {
  // Send an empty JSON body, because the service refuses a POST without one
  const response = await ask('/api/auth/signout', 'POST', SESSION_TIMEOUT_MS, {});

  // Ignore a 401 because it means the session had already ended
  if (!response.ok && response.status !== 401) {
    throw await failure(response, INVALID_SIGN_IN);
  }
}

/**
 * Send one request to a sign-in route with the session cookie, or throw why it never arrived.
 */
async function ask(path: string, method: 'GET' | 'POST', timeoutMs: number, body?: unknown): Promise<Response> {
  try {
    return await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (problem) {
    // AbortSignal.timeout rejects with a TimeoutError; anything else means no connection
    const slow = problem instanceof DOMException && problem.name === 'TimeoutError';
    throw new Error(slow ? 'The sign-in service took too long to answer. Try again.' : 'Could not reach the sign-in service. Check the connection, then try again.');
  }
}

/**
 * Return the account in a successful reply, or throw what the reply means.
 *
 * `invalidMessage` is what a 422 says when the service does not explain it.
 */
async function accountFrom(response: Response, invalidMessage: string): Promise<Account> {
  if (!response.ok) {
    throw await failure(response, invalidMessage);
  }

  // Check the shape before trusting it, because a proxy can answer 200 with a page of its own
  const account = readAccount(await response.json().catch(() => null));
  if (account === null) {
    throw new Error('The sign-in service sent a reply the app could not read. Try again.');
  }
  return account;
}

/**
 * Return the error for a failed reply, keeping its status so a screen can react to a duplicate.
 */
async function failure(response: Response, invalidMessage: string): Promise<ServiceError> {
  const { status } = response;

  // Show the service's own reason for refusing the fields, when it gave a short one
  if (status === 422) {
    const detail = await readDetail(response);
    return new ServiceError(detail ?? invalidMessage, status);
  }
  return new ServiceError(STATUS_MESSAGES[status] ?? `The sign-in service answered with status ${status}. Try again.`, status);
}

/**
 * Return the short explanation in an error reply, or null when there is none worth showing.
 */
async function readDetail(response: Response): Promise<string | null> {
  const reply: unknown = await response.json().catch(() => null);
  const detail = typeof reply === 'object' && reply !== null ? (reply as Record<string, unknown>).detail : null;

  // Ignore a list of field errors or a long text because neither reads as a sentence to act on
  if (typeof detail !== 'string' || detail.trim() === '' || detail.length > DETAIL_MAX_LENGTH) {
    return null;
  }
  return detail;
}
