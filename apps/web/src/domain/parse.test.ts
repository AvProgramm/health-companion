import { describe, expect, it } from 'vitest';
import { parseEntry, type ParseResult } from './parse';
import { TEST_FOODS } from './testFoods';

// Return the draft items of a meal result, or fail the test
function itemsOf(result: ParseResult) {
  if (result.kind !== 'meal') {
    throw new Error(`Expected a meal, got ${result.kind}`);
  }
  return result.items.map((item) => ({ food: item.food?.id ?? null, quantity: item.quantity, problem: item.problem }));
}

describe('parseEntry: meals', () => {
  it('reads two foods with a count and a unit (the S01 example)', () => {
    expect(itemsOf(parseEntry('2 Weetabix and 300 ml milk', TEST_FOODS))).toEqual([
      { food: 'weetabix', quantity: { amount: 2, unit: 'piece' }, problem: null },
      { food: 'demo_milk', quantity: { amount: 300, unit: 'mL' }, problem: null },
    ]);
  });

  it('reads joined units, plurals, aliases and lead-in words', () => {
    expect(itemsOf(parseEntry('I had two wheat biscuits + 250ml of full cream milk for breakfast', TEST_FOODS))).toEqual([
      { food: 'weetabix', quantity: { amount: 2, unit: 'piece' }, problem: null },
      { food: 'demo_milk', quantity: { amount: 250, unit: 'mL' }, problem: null },
    ]);
  });

  it('leaves the amount open for a container like a mug', () => {
    const [item] = itemsOf(parseEntry('a mug of milk', TEST_FOODS));
    expect(item?.food).toBe('demo_milk');
    expect(item?.quantity).toBeNull();
    expect(item?.problem).toMatch(/mug/);
  });

  it('leaves the amount open when none was typed', () => {
    const [item] = itemsOf(parseEntry('rice', TEST_FOODS));
    expect(item).toEqual({ food: 'rice', quantity: null, problem: expect.stringMatching(/how much/i) });
  });

  it('refuses a unit that does not fit the label instead of converting it', () => {
    const [item] = itemsOf(parseEntry('300 g milk', TEST_FOODS));
    expect(item?.quantity).toBeNull();
    expect(item?.problem).toMatch(/mL/);
  });

  it('reports an unknown food instead of guessing one', () => {
    expect(itemsOf(parseEntry('rice and gravy', TEST_FOODS))).toEqual([
      { food: 'rice', quantity: null, problem: expect.any(String) },
      { food: null, quantity: null, problem: 'No saved food called "gravy".' },
    ]);
  });

  it('keeps the typed amount of an unknown food, so adding the food does not lose it', () => {
    const result = parseEntry('2 oatcakes and 30g honey', TEST_FOODS);
    expect(result.kind === 'meal' ? result.items.map((item) => item.typedAmount) : null).toEqual([
      { amount: 2, unit: null },
      { amount: 30, unit: 'g' },
    ]);
  });

  // Typed on the phone on 7 Nov: the correction came inside the same message
  it('lets "actually" inside an item replace that item\'s amount', () => {
    expect(itemsOf(parseEntry('2 weetabix and 250ml of milk actually 300ml', TEST_FOODS))).toEqual([
      { food: 'weetabix', quantity: { amount: 2, unit: 'piece' }, problem: null },
      { food: 'demo_milk', quantity: { amount: 300, unit: 'mL' }, problem: null },
    ]);
  });

  it('joins a correction split off by a comma to the item before it', () => {
    expect(itemsOf(parseEntry('300 ml milk, actually 250 ml', TEST_FOODS))).toEqual([
      { food: 'demo_milk', quantity: { amount: 250, unit: 'mL' }, problem: null },
    ]);
  });

  it('keeps the first unit when the correction is only a number', () => {
    expect(itemsOf(parseEntry('2 weetabix no 3', TEST_FOODS))).toEqual([
      { food: 'weetabix', quantity: { amount: 3, unit: 'piece' }, problem: null },
    ]);
  });

  it('does not treat "no" without a number inside an item as a correction', () => {
    const [item] = itemsOf(parseEntry('black coffee no sugar', TEST_FOODS));
    expect(item?.food).toBe('coffee');
  });

  it('returns empty for blank text', () => {
    expect(parseEntry('   ', TEST_FOODS)).toEqual({ kind: 'empty' });
  });
});

describe('parseEntry: corrections', () => {
  it.each([
    ['actually, 250 mL', 250, 'mL', null],
    ['Actually 250ml', 250, 'mL', null],
    ['no, it was 250 ml of milk', 250, 'mL', 'milk'],
    ['sorry make it 1', 1, null, null],
    ['change the milk to 200ml', 200, 'mL', 'milk'],
    ['make it 2', 2, null, null],
  ] as const)('reads "%s"', (text, amount, unit, foodHint) => {
    expect(parseEntry(text, TEST_FOODS)).toEqual({ kind: 'correction', amount: { amount, unit }, foodHint });
  });

  it('does not treat "no" without a number as a correction', () => {
    expect(parseEntry('no sugar coffee', TEST_FOODS).kind).toBe('meal');
  });
});

describe('parseEntry: questions', () => {
  it.each([
    ['How much protein today?', 'protein_g'],
    ["what's my added sugar", 'added_sugar_g'],
    ['total calories?', 'kcal'],
    ['how much sugar did I have?', 'total_sugar_g'],
  ] as const)('reads "%s" as a question about %s', (text, nutrient) => {
    expect(parseEntry(text, TEST_FOODS)).toEqual({ kind: 'question', nutrient });
  });

  it('marks a question the diary cannot answer as unknown', () => {
    expect(parseEntry("what's the bus timetable?", TEST_FOODS).kind).toBe('unknown');
  });
});
