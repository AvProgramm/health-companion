// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openDiary } from '../../storage/connection';
import { MeView } from './MeView';

// Isolate the page boundary from unrelated editable profile forms.
vi.mock('../components/me/ProfileEditor', () => ({ ProfileEditor: () => null }));
vi.mock('../components/me/BodyCard', () => ({ BodyCard: () => null }));

it('opens local settings without Google sign-in or a Firebase request', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const db = await openDiary(new IDBFactory());
  const container = document.createElement('div');
  const root = createRoot(container);
  const fetchMock = vi.fn().mockRejectedValue(new Error('Offline fictional test.'));
  vi.stubGlobal('fetch', fetchMock);
  try {
    await act(async () => root.render(createElement(MeView, {
      db, profileSnapshot: null, onSaveProfile: vi.fn(), durability: 'unknown', foodCount: 0,
      hideNumbers: false, onHideNumbersChange: vi.fn(), onDiaryReplaced: vi.fn(),
    })));
    expect(container.textContent).not.toContain('Connect with Google');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Download backup');
  } finally {
    await act(async () => root.unmount());
    db.close();
    vi.unstubAllGlobals();
  }
});
