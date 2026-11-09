import { describe, expect, it } from 'vitest';
import { energyBalance } from './balance';

/** Return a fictional energy total. */
function total(known: number, unknownItems = 0) {
  return { known, knownItems: 2, unknownItems };
}

describe('energy balance', () => {
  it('matches the values worked by hand', () => {
    expect(energyBalance(total(1200), 2000)).toEqual({ eaten: 1200, unknownItems: 0, need: 2000, left: 800, leftIsAtMost: false });
  });

  it('says "at most" when any item has no energy value', () => {
    expect(energyBalance(total(1200, 2), 2000)).toMatchObject({ left: 800, leftIsAtMost: true, unknownItems: 2 });
  });

  it('goes negative rather than stopping at zero when over the need', () => {
    expect(energyBalance(total(2300), 2000).left).toBe(-300);
  });

  it('leaves what is left unknown when no need can be estimated', () => {
    expect(energyBalance(total(1200), null)).toMatchObject({ need: null, left: null });
  });
});
