// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { prepareAccount, signInGoogle, signOutAccount } from '../../../api/firebaseAccount';
import { CloudAccount } from './CloudAccount';

// Keep account tests independent of Google popups and real user identities.
vi.mock('../../../api/firebaseAccount', () => ({ prepareAccount: vi.fn(), signInGoogle: vi.fn(), signOutAccount: vi.fn() }));
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  vi.mocked(prepareAccount).mockResolvedValue(null);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

it('waits for an explicit Google sign-in and does not claim a diary upload', async () => {
  vi.mocked(signInGoogle).mockResolvedValue({ uid: 'fictional-user', displayName: 'Fictional Person' });
  await act(async () => root.render(createElement(CloudAccount)));
  expect(signInGoogle).not.toHaveBeenCalled();
  await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
  expect(container.textContent).toContain('Fictional Person');
  expect(container.textContent).toContain('Your diary has not been uploaded');
});

it('clears the account display after signing out', async () => {
  vi.mocked(prepareAccount).mockResolvedValue({ uid: 'fictional-user', displayName: 'Fictional Person' });
  vi.mocked(signOutAccount).mockResolvedValue(undefined);
  await act(async () => root.render(createElement(CloudAccount)));
  await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
  expect(signOutAccount).toHaveBeenCalledOnce();
  expect(container.textContent).not.toContain('Fictional Person');
  expect(container.textContent).toContain('Sign in with Google');
});

it('shows a failed setup without hiding the account card', async () => {
  vi.mocked(prepareAccount).mockRejectedValue(new Error('Complete Firebase setup.'));
  await act(async () => root.render(createElement(CloudAccount)));
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('Complete Firebase setup.');
});
