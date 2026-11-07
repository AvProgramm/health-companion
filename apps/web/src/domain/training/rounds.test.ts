import { expect, it } from 'vitest';
import type { MovementCard } from './catalogue';
import { fillRepeatedRound } from './rounds';

/** Return fictional blocks with fixed whole-minute durations. */
function blocks(durations: number[]): MovementCard[] {
  return durations.map((minutes, index) => ({ id: `fictional-${index}`, name: 'Fictional block', category: 'core', equipment: [], requires: [], minutes, cue: 'Fictional cue.' }));
}

it('fills sixty minutes with four rounds of a fifteen-minute selection', () => {
  const result = fillRepeatedRound(blocks([4, 5, 6]), 60);
  expect(result).toMatchObject({ minutes: 60, unfilledMinutes: 0, fullRounds: 4, extraBlocks: 0 });
  expect(result.blocks.map(block => block.repeatCount)).toEqual([4, 4, 4]);
});

it('finds 31 minutes by using fewer full rounds and a reachable remainder', () => {
  // Greedily taking two full rounds leaves an impossible one-minute remainder.
  const result = fillRepeatedRound(blocks([4, 5, 6]), 31);
  expect(result).toMatchObject({ minutes: 31, unfilledMinutes: 0, fullRounds: 1, extraBlocks: 3 });
  expect(result.blocks.map(block => block.repeatCount)).toEqual([2, 1, 3]);
});

it('reports an impossible exact total instead of inventing a two-minute block', () => {
  expect(fillRepeatedRound(blocks([5, 10]), 17)).toMatchObject({ minutes: 15, unfilledMinutes: 2 });
});

it('keeps output compact even for a billion-minute input', () => {
  const result = fillRepeatedRound(blocks([4, 5, 6]), 1_000_000_007);
  expect(result.minutes).toBe(1_000_000_007);
  expect(result.blocks).toHaveLength(3);
  expect(result.blocks.reduce((sum, block) => sum + block.minutes, 0)).toBe(result.minutes);
});

it.each([[3, 5], [4, 5, 6], [6, 10], [7, 11], [2, 3, 7]])('matches an independent reachability oracle for round %j', (...durations) => {
  const cards = blocks(durations);
  const baseMinutes = durations.reduce((sum, minutes) => sum + minutes, 0);
  // Enumerate all reachable tail totals directly, without residue classes or shortest paths.
  const reachable = Array<boolean>(81).fill(false);
  reachable[0] = true;
  for (let total = 1; total <= 80; total += 1) {
    reachable[total] = durations.some(minutes => total >= minutes && reachable[total - minutes]);
  }
  for (let extra = 0; extra <= 80; extra += 1) {
    let expected = extra;
    while (!reachable[expected]) expected -= 1;
    const result = fillRepeatedRound(cards, baseMinutes + extra);
    expect(result.minutes).toBe(baseMinutes + expected);
    expect(result.blocks.every(block => Number.isSafeInteger(block.repeatCount) && block.repeatCount >= 1)).toBe(true);
    expect(result.blocks.reduce((sum, block) => sum + block.minutes, 0)).toBe(result.minutes);
  }
});


it('rejects malformed or oversized source rounds before creating a residue table', () => {
  for (const durations of [[0], [1.5], [61], Array<number>(13).fill(5)]) {
    expect(() => fillRepeatedRound(blocks(durations), 1000)).toThrow('Choose a fitting round');
  }
});
