/**
 * Reading numbers and units at the start of a piece of text ("300ml milk", "two weetabix").
 */
import { normaliseName } from '../nutrition/foods';
import type { Unit } from '../shared/units';

// Words that can stand in for a number at the start of an item
const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5,
};

// The spellings of each unit people actually type
const UNIT_WORDS: Record<string, Unit> = {
  g: 'g', gm: 'g', gram: 'g', grams: 'g',
  kg: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  ml: 'mL', millilitre: 'mL', millilitres: 'mL', milliliter: 'mL', milliliters: 'mL',
  l: 'L', litre: 'L', litres: 'L', liter: 'L', liters: 'L',
  piece: 'piece', pieces: 'piece', pc: 'piece', pcs: 'piece',
};

// Match "milk no wait 300ml" or "milk actually 300ml"; "nothing" is not "no".
const INLINE_CORRECTION = /[\s,]+(?:(?:no\s+wait|actually|no|sorry|i\s+mean|make\s+(?:that|it)|or\s+rather)(?![a-z])[\s,:-]*)+/;

export interface LeadingAmount {
  amount: number | null;
  unit: Unit | null;
  rest: string;
}

/**
 * Return a leading number and unit read from the text, plus the rest of the text.
 *
 * "300ml milk" and "300 ml of milk" both give 300, mL and "milk".
 */
export function readLeadingAmount(text: string): LeadingAmount {
  // Split "300ml" into "300 ml" so number and unit become separate words
  const words = text.replace(/^(\d+(?:\.\d+)?)([a-z]+)\b/, '$1 $2').split(' ').filter((word) => word !== '');

  // Read the number, written in digits or as a word
  let index = 0;
  let amount: number | null = null;
  const first = words[0];
  if (first !== undefined && /^\d+(?:\.\d+)?$/.test(first)) {
    amount = Number(first);
    index = 1;
  } else if (first !== undefined && first in NUMBER_WORDS) {
    amount = NUMBER_WORDS[first] ?? null;
    index = 1;
  }

  // Read the unit, which only counts straight after a number
  let unit: Unit | null = null;
  const second = words[index];
  if (amount !== null && second !== undefined && second in UNIT_WORDS) {
    unit = UNIT_WORDS[second] ?? null;
    index += 1;
  }

  // Skip "of" in "300 ml of milk", then return the rest as the food name
  if (unit !== null && words[index] === 'of') {
    index += 1;
  }
  return { amount, unit, rest: normaliseName(words.slice(index).join(' ')) };
}

/**
 * Return an item's amount and name, letting a later "actually 300ml" replace the first amount.
 *
 * "250ml of milk actually 300ml" gives 300, mL and "milk". When only a number
 * follows ("2 weetabix no 3"), the first unit is kept.
 */
export function readCorrectedAmount(part: string): LeadingAmount {
  const correction = INLINE_CORRECTION.exec(part);
  if (correction === null) {
    return readLeadingAmount(part);
  }

  const first = readLeadingAmount(part.slice(0, correction.index));
  const fix = readLeadingAmount(part.slice(correction.index + correction[0].length));

  // Ignore "milk no sugar": without a number after it, the word is not a correction
  if (fix.amount === null) {
    return readLeadingAmount(part);
  }

  // The corrected amount wins, keeping the first unit and name when the correction omits them
  return { amount: fix.amount, unit: fix.unit ?? first.unit, rest: fix.rest !== '' ? fix.rest : first.rest };
}
