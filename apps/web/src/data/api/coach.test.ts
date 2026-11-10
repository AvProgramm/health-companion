import { afterEach, expect, it, vi } from 'vitest';
import { askCoach } from './coach';

afterEach(() => vi.unstubAllGlobals());

it('rejects diary lines before any network request in the free-tier setup', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  await expect(askCoach('Fictional question', ['2026-01-05: fictional food logged'])).rejects.toThrow('Diary sharing is paused');
  expect(fetchMock).not.toHaveBeenCalled();
});
