import { describe, expect, it } from 'vitest';
import { weekLines } from './weekLines';

describe('weekLines', () => {
  it('writes a full day with its foods, sessions and sleep', () => {
    const lines = weekLines([{ date: '2026-01-05', energy: { known: 1800.4, knownItems: 3, unknownItems: 0 }, sessions: 1, sleepMinutes: 450 }],
      new Map([['2026-01-05', ['Fictional oats', 'Fictional dal', 'Fictional oats']]]));
    expect(lines).toEqual(['2026-01-05: food 1800 kcal (Fictional oats, Fictional dal); training 1 session; sleep 7 h 30 min']);
  });

  it('keeps a gap, an unknown and a partial total apart, never writing zero', () => {
    const lines = weekLines([
      { date: '2026-01-05', energy: null, sessions: 0, sleepMinutes: null },
      { date: '2026-01-06', energy: { known: 0, knownItems: 0, unknownItems: 2 }, sessions: 2, sleepMinutes: 0 },
      { date: '2026-01-07', energy: { known: 500, knownItems: 1, unknownItems: 1 }, sessions: 0, sleepMinutes: null },
    ], new Map());
    expect(lines[0]).toBe('2026-01-05: food nothing logged; training nothing logged; sleep nothing logged');
    expect(lines[1]).toBe('2026-01-06: food logged, energy unknown; training 2 sessions; sleep 0 h 0 min');
    expect(lines[2]).toContain('food at least 500 kcal, 1 item(s) unknown');
  });

  it('keeps every line within what the service accepts', () => {
    const names = Array.from({ length: 30 }, (_, index) => `Fictional food with a long name ${index}`);
    const [line] = weekLines([{ date: '2026-01-05', energy: { known: 1, knownItems: 1, unknownItems: 0 }, sessions: 0, sleepMinutes: null }], new Map([['2026-01-05', names]]));
    expect(line!.length).toBeLessThanOrEqual(200);
  });
});
