import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteAccountBackup, loadAccountBackup, readAccountBackupStatus, saveAccountBackup } from './accountBackup';

afterEach(() => vi.unstubAllGlobals());

// When and how large a fictional saved backup is, as the service reports it
const STATUS = { savedAt: '2026-11-09T10:00:00.000000+00:00', sizeBytes: 2048 };
// A fictional backup; this boundary passes it on without reading its meaning
const BACKUP = { format: 'health-companion-backup', meals: [{ id: 'fictional-lunch' }] };

/** Stub fetch with one reply of this status and JSON body, and return the mock. */
function respondWith(status: number, body?: unknown) {
  const reply = { ok: status >= 200 && status < 300, status, json: async () => { if (body === undefined) throw new SyntaxError('No body.'); return body; } };
  const fetchMock = vi.fn().mockResolvedValue(reply);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('saving a backup to the account', () => {
  it('puts only the backup, with the same-origin cookie', async () => {
    const fetchMock = respondWith(200, STATUS);
    await expect(saveAccountBackup(BACKUP)).resolves.toEqual(STATUS);
    const [path, options] = fetchMock.mock.calls[0]!;
    expect(path).toBe('/api/account/backup');
    expect(options).toMatchObject({ method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } });
    expect(JSON.parse(options.body)).toEqual({ backup: BACKUP });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    [401, /Sign in again/],
    [413, /5 MB.*Download a backup file instead\./],
    [500, /could not complete this\. Try again in a minute\./],
    [502, /not running/],
    [504, /not running/],
    [418, /status 418/],
  ])('explains status %i', async (status, message) => {
    respondWith(status, { detail: 'Fictional detail that must not replace the app sentence.' });
    await expect(saveAccountBackup(BACKUP)).rejects.toThrow(message);
    await expect(saveAccountBackup(BACKUP)).rejects.toMatchObject({ status });
  });

  it.each([[{ savedAt: '', sizeBytes: 5 }], [{ savedAt: 'yesterday', sizeBytes: 5 }], [{ savedAt: STATUS.savedAt }], [{ ...STATUS, sizeBytes: -1 }], [{ ...STATUS, sizeBytes: Number.NaN }], [{ ...STATUS, sizeBytes: '5' }], ['<html>'], [undefined]])('refuses a success reply shaped like %j', async (body) => {
    respondWith(200, body);
    await expect(saveAccountBackup(BACKUP)).rejects.toThrow(/could not read/);
  });

  it('tells a slow service from an unreachable one', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Fictional timeout.', 'TimeoutError')));
    await expect(saveAccountBackup(BACKUP)).rejects.toThrow(/took too long/);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(saveAccountBackup(BACKUP)).rejects.toThrow(/Could not reach the account service\. Check the connection/);
  });
});

describe('reading the status of the account backup', () => {
  it('returns when it was saved and its size, dropping fields it does not know', async () => {
    const fetchMock = respondWith(200, { ...STATUS, backup: BACKUP });
    await expect(readAccountBackupStatus()).resolves.toEqual(STATUS);
    const [path, options] = fetchMock.mock.calls[0]!;
    expect(path).toBe('/api/account/backup/status');
    expect(options).toMatchObject({ method: 'GET', credentials: 'same-origin' });
    expect(options.body).toBeUndefined();
  });

  it('returns null when no backup is saved, which is a state and not a failure', async () => {
    respondWith(404, { detail: 'No backup is saved for this account yet.' });
    await expect(readAccountBackupStatus()).resolves.toBeNull();
  });

  it('asks the person to sign in again when the session ended', async () => {
    respondWith(401, { detail: 'Sign in to continue.' });
    await expect(readAccountBackupStatus()).rejects.toThrow(/Sign in again/);
  });
});

describe('loading the account backup', () => {
  it('returns the backup unread, for the caller to validate', async () => {
    const fetchMock = respondWith(200, { ...STATUS, backup: BACKUP });
    await expect(loadAccountBackup()).resolves.toEqual({ ...STATUS, backup: BACKUP });
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/account/backup');
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'GET', credentials: 'same-origin' });
  });

  it('says that nothing is saved when the account has no backup', async () => {
    respondWith(404, { detail: 'Fictional detail.' });
    await expect(loadAccountBackup()).rejects.toThrow('No backup is saved for this account yet.');
  });

  it.each([[STATUS], [{ ...STATUS, backup: null }], [{ ...STATUS, backup: [BACKUP] }], [{ ...STATUS, backup: 'text' }], [{ backup: BACKUP }]])('refuses a success reply shaped like %j', async (body) => {
    respondWith(200, body);
    await expect(loadAccountBackup()).rejects.toThrow(/could not read/);
  });
});

describe('deleting the account backup', () => {
  it('sends a delete with the cookie and no body', async () => {
    const fetchMock = respondWith(204);
    await expect(deleteAccountBackup()).resolves.toBeUndefined();
    const [path, options] = fetchMock.mock.calls[0]!;
    expect(path).toBe('/api/account/backup');
    expect(options).toMatchObject({ method: 'DELETE', credentials: 'same-origin' });
    expect(options.body).toBeUndefined();
  });

  it('reports a failure instead of claiming the copy is gone', async () => {
    respondWith(500);
    await expect(deleteAccountBackup()).rejects.toThrow(/could not complete this/);
    respondWith(401);
    await expect(deleteAccountBackup()).rejects.toThrow(/Sign in again/);
  });
});
