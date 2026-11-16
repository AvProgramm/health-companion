import { describe, expect, it } from 'vitest';
import { errorText, formatEnergyCell, formatEnergySoFar, formatSleepCell } from './format';

describe('error text', () => {
  it('shows an error by its message alone', () => {
    expect(errorText(new Error('The diary could not open.'))).toBe('The diary could not open.');
  });

  it('shows anything else that was thrown as text', () => {
    expect(errorText('Not an error object')).toBe('Not an error object');
  });
});

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

describe('energy so far on the Today button', () => {
  it('says nothing was logged instead of 0 kcal', () => {
    expect(formatEnergySoFar(null)).toBe('Nothing logged');
  });

  it('never shows a number for food with no energy value', () => {
    expect(formatEnergySoFar({ known: 0, knownItems: 0, unknownItems: 1 })).toBe('Energy unknown');
  });

  it('shows the rounded kcal with the same marks as the week view', () => {
    expect(formatEnergySoFar({ known: 1234.6, knownItems: 2, unknownItems: 1, range: { low: 1000, high: 1400 } })).toBe('≈1235+ kcal');
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
