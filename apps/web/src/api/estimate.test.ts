import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestEstimate } from './estimate';

afterEach(() => vi.unstubAllGlobals());

describe('estimate request', () => {
  it('sends only name and portionText even if the caller has diary fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);
    await expect(requestEstimate({ name: 'Fictional oats', portionText: '50 g', diary: 'private' } as { name: string; portionText: string })).rejects.toThrow();
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ name: 'Fictional oats', portionText: '50 g' });
  });

  it('returns an actionable fallback when the laptop is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(requestEstimate({ name: 'Fictional oats', portionText: '50 g' })).rejects.toThrow('Estimates need the laptop');
  });
});
