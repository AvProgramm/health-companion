import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSession, signIn, signOut, signUp } from './auth';

afterEach(() => vi.unstubAllGlobals());

// A fictional account as the service returns it
const ACCOUNT = { id: 'fictional-1', email: 'person@example.org' };

/** Stub fetch with one reply of this status and JSON body, and return the mock. */
function respondWith(status: number, body?: unknown) {
  const reply = { ok: status >= 200 && status < 300, status, json: async () => { if (body === undefined) throw new SyntaxError('No body.'); return body; } };
  const fetchMock = vi.fn().mockResolvedValue(reply);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('sign up and sign in', () => {
  it('posts only the email and password, with the same-origin cookie', async () => {
    const fetchMock = respondWith(201, ACCOUNT);
    await expect(signUp('person@example.org', 'fictional-password')).resolves.toEqual(ACCOUNT);
    const [path, options] = fetchMock.mock.calls[0]!;
    expect(path).toBe('/api/auth/signup');
    expect(options).toMatchObject({ method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } });
    expect(JSON.parse(options.body)).toEqual({ email: 'person@example.org', password: 'fictional-password' });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns the account from a sign-in, dropping fields it does not know', async () => {
    const fetchMock = respondWith(200, { ...ACCOUNT, token: 'fictional' });
    await expect(signIn('person@example.org', 'fictional-password')).resolves.toEqual(ACCOUNT);
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/auth/signin');
  });

  it.each([
    [401, /Email or password is incorrect\./],
    [409, /already exists\. Sign in instead\./],
    [429, /Too many attempts\. Wait a few minutes and try again\./],
    [502, /not running/],
    [503, /not set up/],
    [504, /not running/],
    [500, /status 500/],
  ])('explains status %i', async (status, message) => {
    respondWith(status, { detail: 'Fictional detail that must not replace the app sentence.' });
    await expect(signIn('person@example.org', 'fictional-password')).rejects.toThrow(message);
    await expect(signUp('person@example.org', 'fictional-password')).rejects.toMatchObject({ status });
  });

  it('shows a short reason the service gave for refusing the fields', async () => {
    respondWith(422, { detail: 'Use a password of at least 10 characters.' });
    await expect(signUp('person@example.org', 'short')).rejects.toThrow('Use a password of at least 10 characters.');
  });

  it.each([[[{ loc: ['body', 'email'], msg: 'fictional' }]], ['x'.repeat(201)], [''], [undefined]])('falls back to its own sentence when the 422 detail is %j', async (detail) => {
    respondWith(422, detail === undefined ? undefined : { detail });
    await expect(signUp('person@example.org', 'short')).rejects.toThrow('Check the email and password, then try again.');
  });

  it.each([[{ id: '', email: 'person@example.org' }], [{ id: 'fictional-1' }], [{ id: 5, email: 'person@example.org' }], ['<html>'], [undefined]])('refuses a success reply shaped like %j', async (body) => {
    respondWith(200, body);
    await expect(signIn('person@example.org', 'fictional-password')).rejects.toThrow(/could not read/);
  });

  it('explains a malformed email on sign-in as an email problem, not a wrong password', async () => {
    respondWith(422, { detail: [{ loc: ['body', 'email'], msg: 'fictional' }] });
    await expect(signIn('person@example', 'fictional-password')).rejects.toThrow('Check the email address, then try again.');
    respondWith(422, { detail: 'Enter a valid email address.' });
    await expect(signIn('person@example', 'fictional-password')).rejects.toMatchObject({ status: 422, message: 'Enter a valid email address.' });
  });

  it('says the service could not be reached when the request never arrives', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(signIn('person@example.org', 'fictional-password')).rejects.toThrow(/Could not reach the sign-in service/);
  });

  it('says the service was too slow when the request times out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError')));
    await expect(signIn('person@example.org', 'fictional-password')).rejects.toThrow(/took too long/);
  });
});

describe('session', () => {
  it('returns the account for a valid session, sending no body', async () => {
    const fetchMock = respondWith(200, ACCOUNT);
    await expect(readSession()).resolves.toEqual(ACCOUNT);
    const [path, options] = fetchMock.mock.calls[0]!;
    expect(path).toBe('/api/auth/session');
    expect(options).toMatchObject({ method: 'GET', credentials: 'same-origin' });
    expect(options.body).toBeUndefined();
  });

  it('returns null when nobody is signed in', async () => {
    respondWith(401);
    await expect(readSession()).resolves.toBeNull();
  });

  it.each([500, 502, 503, 504])('throws on status %i, so a failing service is not read as signed out', async (status) => {
    respondWith(status);
    await expect(readSession()).rejects.toMatchObject({ status });
  });

  it('throws when the request never arrives', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(readSession()).rejects.toThrow(/Could not reach/);
  });

  it('throws on a 200 that is not an account', async () => {
    respondWith(200, { id: '', email: '' });
    await expect(readSession()).rejects.toThrow(/could not read/);
  });
});

describe('sign out', () => {
  it('posts an empty JSON body to the sign-out route and accepts 204', async () => {
    const fetchMock = respondWith(204);
    await expect(signOut()).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/auth/signout');
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  });

  it('accepts 401, because the session had already ended', async () => {
    respondWith(401);
    await expect(signOut()).resolves.toBeUndefined();
  });

  it('throws when the service fails, so the app does not claim to be signed out', async () => {
    respondWith(503);
    await expect(signOut()).rejects.toMatchObject({ status: 503 });
  });
});
