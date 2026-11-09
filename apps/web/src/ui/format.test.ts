import { describe, expect, it } from 'vitest';
import { formatEnergyCell, formatSleepCell } from './format';

describe('energy in the week view', () => {
  it('shows a dash when no food was logged', () => {
    expect(formatEnergyCell(null)).toBe('–');
  });

  it('never shows a number for food with no energy value', () => {
    expect(formatEnergyCell({ known: 0, knownItems: 0, unknownItems: 2 })).toBe('?');
  });

  it('rounds a fully known day for display', () => {
    expect(formatEnergyCell({ known: 1500.4, knownItems: 3, unknownItems: 0 })).toBe('1500');
  });

  it('says at least this much when some items have no value', () => {
    expect(formatEnergyCell({ known: 1500, knownItems: 3, unknownItems: 2 })).toBe('1500+');
  });

  it('marks a day that includes estimates', () => {
    expect(formatEnergyCell({ known: 1500, knownItems: 3, unknownItems: 0, range: { low: 1300, high: 1700 } })).toBe('≈1500');
  });
});

describe('sleep in the week view', () => {
  it('shows hours to one decimal place', () => {
    expect(formatSleepCell(450)).toBe('7.5h');
  });

  it('shows a dash when no sleep was logged', () => {
    expect(formatSleepCell(null)).toBe('–');
  });
});
