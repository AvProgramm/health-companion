import { describe, expect, it } from 'vitest';
import { localDateIn } from './dates';

describe('localDateIn', () => {
  it('uses the local day, not the UTC day', () => {
    // 00:30 on 10 Nov in Kuala Lumpur is still 9 Nov in UTC
    const instant = new Date('2026-11-09T16:30:00Z');
    expect(localDateIn('Asia/Kuala_Lumpur', instant)).toBe('2026-11-10');
    expect(localDateIn('UTC', instant)).toBe('2026-11-09');
  });
});
