import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestEstimate } from './estimate';

afterEach(() => vi.unstubAllGlobals());

// A fetch that answers with only an HTTP status, like the preview proxy does on failure
function respondWith(status: number) {
  return vi.fn().mockResolvedValue({ ok: false, status });
}

describe('estimate request', () => {
  it('sends only name and portionText even if the caller has diary fields', async () => {
    const fetchMock = respondWith(500);
    vi.stubGlobal('fetch', fetchMock);
    await expect(requestEstimate({ name: 'Fictional oats', portionText: '50 g', diary: 'private' } as { name: string; portionText: string })).rejects.toThrow();
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ name: 'Fictional oats', portionText: '50 g' });
  });

  // Seen on the phone on 7 Nov: every failure said "Estimates need the laptop", so the cause was unclear
  it('says the laptop could not be reached when the request never arrives', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(requestEstimate({ name: 'Fictional oats', portionText: '50 g' })).rejects.toThrow(/Could not reach the laptop.*USB/);
  });

  it('says the laptop was too slow when the request times out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError')));
    await expect(requestEstimate({ name: 'Fictional oats', portionText: '50 g' })).rejects.toThrow(/took too long/);
  });

  it.each([502, 504])('says the estimate service is not running when the proxy answers %i', async (status) => {
    vi.stubGlobal('fetch', respondWith(status));
    await expect(requestEstimate({ name: 'Fictional oats', portionText: '50 g' })).rejects.toThrow(/estimate service is not running/);
  });

  it('says no source had an answer when the service returns 503', async () => {
    vi.stubGlobal('fetch', respondWith(503));
    await expect(requestEstimate({ name: 'Fictional oats', portionText: '50 g' })).rejects.toThrow(/No usable estimate/);
  });
});
