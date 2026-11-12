// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSession, signIn, signOut, signUp } from '../data/api/auth';
import { readRememberedAccount, rememberAccount } from '../data/storage/account';
import { AccountGate } from './AccountGate';

vi.mock('../data/api/auth', () => ({ readSession: vi.fn(), signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn() }));

// Stand in for the whole app with one line saying whose diary opened, and a sign-out button
vi.mock('./App', () => ({
  App: ({ diaryName, accountEmail, accountOffline, onSignOut }: { diaryName: string; accountEmail: string; accountOffline: boolean; onSignOut: () => Promise<void> }) =>
    createElement('button', { type: 'button', onClick: () => { onSignOut().catch(() => {}); } }, `Diary ${diaryName} open for ${accountEmail}${accountOffline ? ', offline' : ''}`),
}));

// Two fictional accounts sharing one browser
const FIRST = { id: 'fictional-1', email: 'first@example.org' };
const SECOND = { id: 'fictional-2', email: 'second@example.org' };

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.resetAllMocks();
  localStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

/** Render the gate and let the session answer arrive. */
async function open() {
  await act(async () => root.render(createElement(AccountGate)));
  await settle();
}

/** Let pending promises finish. */
async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

/** Type into one input the way React hears it. */
async function type(id: string, text: string) {
  const input = container.querySelector<HTMLInputElement>(`#${id}`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Submit the sign-in form and let the request settle. */
async function submit() {
  await act(async () => container.querySelector('form')!.requestSubmit());
  await settle();
}

describe('account gate', () => {
  it('shows a placeholder, not the sign-in screen, while the session is being asked for', async () => {
    vi.mocked(readSession).mockReturnValue(new Promise(() => {}));
    await open();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelector('form')).toBeNull();
  });

  it('goes straight to the existing diary with a valid session, and remembers the account', async () => {
    vi.mocked(readSession).mockResolvedValue(FIRST);
    await open();
    expect(container.textContent).toBe('Diary health-companion open for first@example.org');
    expect(container.querySelector('form')).toBeNull();
    expect(readRememberedAccount()).toEqual(FIRST);
  });

  it('shows sign-in on a 401 and forgets the remembered account', async () => {
    rememberAccount(FIRST);
    vi.mocked(readSession).mockResolvedValue(null);
    await open();
    expect(container.querySelector('h1')!.textContent).toBe('Sign in');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(readRememberedAccount()).toBeNull();
  });

  it('opens the remembered account offline when the service cannot be asked', async () => {
    rememberAccount(FIRST);
    vi.mocked(readSession).mockRejectedValue(new Error('Could not reach the sign-in service. Check the connection, then try again.'));
    await open();
    expect(container.textContent).toBe('Diary health-companion open for first@example.org, offline');
    expect(readRememberedAccount()).toEqual(FIRST);
  });

  it('shows sign-in with the reason and a retry when nobody is remembered', async () => {
    vi.mocked(readSession).mockRejectedValueOnce(new Error('Could not reach the sign-in service. Check the connection, then try again.')).mockResolvedValueOnce(FIRST);
    await open();
    expect(container.querySelector('[role="alert"]')!.textContent).toMatch(/Could not reach the sign-in service/);
    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Try again')!.click());
    await settle();
    expect(container.textContent).toBe('Diary health-companion open for first@example.org');
  });

  it('opens the app after a sign-up, without asking for the session again', async () => {
    vi.mocked(readSession).mockResolvedValue(null);
    vi.mocked(signUp).mockResolvedValue(FIRST);
    await open();
    await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Create account')!.click());
    await type('signin-email', 'first@example.org');
    await type('signin-password', 'fictional-password');
    await type('signin-confirm', 'fictional-password');
    await submit();
    expect(signUp).toHaveBeenCalledExactlyOnceWith('first@example.org', 'fictional-password');
    expect(container.textContent).toBe('Diary health-companion open for first@example.org');
    expect(readSession).toHaveBeenCalledOnce();
    expect(JSON.stringify(Object.values({ ...localStorage }))).not.toContain('fictional-password');
  });

  it('gives a second account on the same browser its own diary', async () => {
    // The first account claims the existing diary, then signs out
    vi.mocked(readSession).mockResolvedValue(FIRST);
    vi.mocked(signOut).mockResolvedValue(undefined);
    vi.mocked(signIn).mockResolvedValue(SECOND);
    await open();
    await act(async () => container.querySelector('button')!.click());
    await settle();
    expect(container.querySelector('h1')!.textContent).toBe('Sign in');
    expect(readRememberedAccount()).toBeNull();

    // The second account signs in on the same browser
    await type('signin-email', 'second@example.org');
    await type('signin-password', 'fictional-password');
    await submit();
    expect(container.textContent).toBe('Diary health-companion:fictional-2 open for second@example.org');
  });

  it('stays signed in when the sign-out request fails', async () => {
    vi.mocked(readSession).mockResolvedValue(FIRST);
    vi.mocked(signOut).mockRejectedValue(new Error('Could not reach the sign-in service. Check the connection, then try again.'));
    await open();
    await act(async () => container.querySelector('button')!.click());
    await settle();
    expect(container.textContent).toBe('Diary health-companion open for first@example.org');
    expect(readRememberedAccount()).toEqual(FIRST);
  });
});
