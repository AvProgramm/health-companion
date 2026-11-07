import { describe, expect, it } from 'vitest';
import { followToday, localDateIn } from './dates';

describe('localDateIn', () => {
  it('uses the local day, not the UTC day', () => {
    // 00:30 on 10 Nov in Kuala Lumpur is still 9 Nov in UTC
    const instant = new Date('2026-11-09T16:30:00Z');
    expect(localDateIn('Asia/Kuala_Lumpur', instant)).toBe('2026-11-10');
    expect(localDateIn('UTC', instant)).toBe('2026-11-09');
  });

  it('moves to the new day one minute after local midnight', () => {
    // 23:59 and 00:00 on the Kuala Lumpur clock, the moment the app must notice
    expect(localDateIn('Asia/Kuala_Lumpur', new Date('2026-11-06T15:59:00Z'))).toBe('2026-11-06');
    expect(localDateIn('Asia/Kuala_Lumpur', new Date('2026-11-06T16:00:00Z'))).toBe('2026-11-07');
  });
});

describe('followToday', () => {
  // Reported on 7 Nov: the app opened on 6 Nov still said "today" was 6 Nov
  it('moves a screen that was showing today on to the new today', () => {
    expect(followToday('2026-11-06', '2026-11-06', '2026-11-07')).toBe('2026-11-07');
  });

  it('keeps an older day the user picked', () => {
    expect(followToday('2026-11-03', '2026-11-06', '2026-11-07')).toBe('2026-11-03');
  });

  it('changes nothing when the date has not changed', () => {
    expect(followToday('2026-11-07', '2026-11-07', '2026-11-07')).toBe('2026-11-07');
  });
});
