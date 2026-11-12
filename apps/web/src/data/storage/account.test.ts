// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { claimDiaryName, forgetAccount, readRememberedAccount, rememberAccount } from './account';
import { DIARY_NAME, openDiary } from './connection';

// Two fictional accounts sharing one browser
const FIRST = { id: 'fictional-1', email: 'first@example.org' };
const SECOND = { id: 'fictional-2', email: 'second@example.org' };

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

/** Replace localStorage with one where every call throws, like a browser that blocks storage. */
function blockStorage() {
  const refuse = () => { throw new DOMException('Fictional blocked storage.', 'SecurityError'); };
  vi.stubGlobal('localStorage', { getItem: refuse, setItem: refuse, removeItem: refuse });
}

describe('diary name', () => {
  it('keeps the name the diary has always had', () => {
    expect(DIARY_NAME).toBe('health-companion');
  });

  it('gives the first account the existing diary, every time it asks', () => {
    expect(claimDiaryName(FIRST.id)).toBe('health-companion');
    expect(claimDiaryName(FIRST.id)).toBe('health-companion');
  });

  it('gives a second account its own diary, every time it asks', () => {
    claimDiaryName(FIRST.id);
    expect(claimDiaryName(SECOND.id)).toBe('health-companion:fictional-2');
    expect(claimDiaryName(SECOND.id)).toBe('health-companion:fictional-2');
    expect(claimDiaryName(FIRST.id)).toBe('health-companion');
  });

  it('keeps the owner after the remembered account is forgotten', () => {
    claimDiaryName(FIRST.id);
    rememberAccount(FIRST);
    forgetAccount();
    expect(claimDiaryName(SECOND.id)).toBe('health-companion:fictional-2');
    expect(claimDiaryName(FIRST.id)).toBe('health-companion');
  });

  it('returns a usable name of the account\'s own when storage is blocked', () => {
    blockStorage();
    expect(claimDiaryName(FIRST.id)).toBe('health-companion:fictional-1');
  });

  it('opens separate databases with the same schema, leaving the first one\'s records alone', async () => {
    // Save one fictional food in the first account's diary
    const factory = new IDBFactory();
    const first = await openDiary(claimDiaryName(FIRST.id), factory);
    await new Promise<void>((resolve, reject) => {
      const tx = first.transaction('foods', 'readwrite');
      tx.objectStore('foods').add({ id: 'fictional-food', version: 1 });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // The second account sees the same stores, and none of the first one's records
    const second = await openDiary(claimDiaryName(SECOND.id), factory);
    expect([...second.objectStoreNames]).toEqual([...first.objectStoreNames]);
    const count = (db: IDBDatabase) => new Promise(resolve => {
      const request = db.transaction('foods').objectStore('foods').count();
      request.onsuccess = () => resolve(request.result);
    });
    expect(await count(second)).toBe(0);
    expect(await count(first)).toBe(1);
    expect((await factory.databases()).map(info => info.name).sort()).toEqual(['health-companion', 'health-companion:fictional-2']);
    first.close();
    second.close();
  });
});

describe('remembered account', () => {
  it('starts with nobody', () => {
    expect(readRememberedAccount()).toBeNull();
  });

  it('remembers only the id and email', () => {
    rememberAccount({ ...FIRST, password: 'fictional-password', token: 'fictional-token' } as typeof FIRST);
    expect(readRememberedAccount()).toEqual(FIRST);
    expect(JSON.stringify(Object.values({ ...localStorage }))).not.toMatch(/password|token/);
  });

  it('forgets the account', () => {
    rememberAccount(FIRST);
    forgetAccount();
    expect(readRememberedAccount()).toBeNull();
  });

  it.each(['not json', '{"id":"","email":"first@example.org"}', '[]', '"fictional-1"'])('treats the damaged record %j as nobody', (stored) => {
    localStorage.setItem('health-companion:account', stored);
    expect(readRememberedAccount()).toBeNull();
  });

  it('does not throw when storage is blocked', () => {
    blockStorage();
    expect(() => rememberAccount(FIRST)).not.toThrow();
    expect(() => forgetAccount()).not.toThrow();
    expect(readRememberedAccount()).toBeNull();
  });
});
