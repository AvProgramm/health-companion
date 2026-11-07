/**
 * A small, deterministic grammar for the composer.
 *
 * It never calls a model and never saves anything. It turns typed text into a
 * draft meal, a correction or a question, and the user confirms what happens next.
 * Text it cannot read is reported as such, so the screen can offer a manual form.
 */
import { findFoods, normaliseName } from './foods';
import type { FoodVersion, NutrientKey } from './types';
import { areCompatible, type Quantity, type Unit } from './units';

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

// Lead-in words that do not name a food ("i had", "ate", ...)
const LEAD_IN = /^(?:i\s+)?(?:had|ate|drank|have|having|log|add)\s+/;

// A trailing meal name ("for breakfast") that is not part of the food
const MEAL_SUFFIX = /\s+(?:for|at)\s+(?:breakfast|lunch|dinner|supper|brunch|snack)$/;

// Separators between items: commas, plus signs, "and", "with", "plus"
const ITEM_SEPARATOR = /\s*(?:,|\+|&|\band\b|\bwith\b|\bplus\b)\s*/;

// "actually 250 ml", "no, it was 250 ml of milk", "sorry make it 2"
// The words may repeat ("no, actually") and a number may follow with no space ("actually250"),
// but a longer word is not a correction ("nothing" is not "no")
const CORRECTION_LEAD = /^(?:(?:actually|no|nope|sorry|oops|wait|correction)(?![a-z])[\s,.:;!-]*)+(?:(?:it\s+)?was\s+|it'?s\s+|make\s+it\s+|i\s+had\s+|only\s+)?/;

// A correction inside one item: "250ml of milk actually 300ml", "2 weetabix no 3"
const INLINE_CORRECTION = /[\s,]+(?:(?:actually|no|sorry|i\s+mean|make\s+(?:that|it)|or\s+rather)(?![a-z])[\s,:-]*)+/;

// "change the milk to 250 ml", "make the milk 250ml"
const CHANGE_TARGET = /^(?:change|make|set)\s+(?:the\s+|my\s+)?(.+?)\s+(?:to\s+)?(\d+(?:\.\d+)?\s*[a-z]*)$/;

// Openers that make a sentence a question
const QUESTION_LEAD = /^(?:how\s+much|how\s+many|what(?:'s|\s+is|\s+was|\s+were)?|show|total|did\s+i)\b/;

// Nutrient words, most specific first so "added sugar" wins over "sugar"
const NUTRIENT_WORDS: readonly [RegExp, NutrientKey][] = [
  [/\badded\s+sugars?\b/, 'added_sugar_g'],
  [/\bsat(?:urated)?\s+fat\b/, 'satfat_g'],
  [/\bprotein\b/, 'protein_g'],
  [/\b(?:calories|calorie|kcal|energy)\b/, 'kcal'],
  [/\bsugars?\b/, 'total_sugar_g'],
  [/\bfat\b/, 'fat_g'],
];

/**
 * An amount read from text; unit is null for a bare count ("2").
 */
export interface ParsedAmount {
  amount: number;
  unit: Unit | null;
}

/**
 * One item of a draft meal. food or quantity is null when the text did not say,
 * and problem explains what the user still has to fill in. typedAmount keeps the
 * number the user typed even when the food is unknown, so it is not lost when
 * they add that food.
 */
export interface DraftItem {
  text: string;
  food: FoodVersion | null;
  quantity: Quantity | null;
  typedAmount: ParsedAmount | null;
  problem: string | null;
}

export type ParseResult =
  | { kind: 'empty' }
  | { kind: 'meal'; items: DraftItem[] }
  | { kind: 'correction'; amount: ParsedAmount; foodHint: string | null }
  | { kind: 'question'; nutrient: NutrientKey }
  | { kind: 'unknown'; text: string };

/**
 * Return what the typed text asks for: a meal, a correction, a question, or unknown.
 */
export function parseEntry(text: string, foods: readonly FoodVersion[]): ParseResult {
  // Normalise case, curly apostrophes and spacing
  const clean = text.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
  if (clean === '') {
    return { kind: 'empty' };
  }

  // Questions first, so "what was my protein" is never read as a food called "protein"
  const question = parseQuestion(clean);
  if (question !== null) {
    return question;
  }

  // Corrections next, because "actually 250 ml" would also read as an item
  const correction = parseCorrection(clean);
  if (correction !== null) {
    return correction;
  }

  // Everything else is read as a meal
  return parseMeal(clean, foods);
}

/**
 * Return a question about a day total, unknown for other questions, or null if it is not a question.
 */
function parseQuestion(clean: string): ParseResult | null {
  // Ignore text that does not look like a question
  if (!clean.endsWith('?') && !QUESTION_LEAD.test(clean)) {
    return null;
  }

  // Find the nutrient being asked about
  for (const [pattern, nutrient] of NUTRIENT_WORDS) {
    if (pattern.test(clean)) {
      return { kind: 'question', nutrient };
    }
  }

  // A question the diary cannot answer from its own records
  return { kind: 'unknown', text: clean };
}

/**
 * Return a correction ("actually 250 ml of milk"), or null if the text is not one.
 */
function parseCorrection(clean: string): ParseResult | null {
  // "change the milk to 250 ml" names the food first
  const named = CHANGE_TARGET.exec(clean);
  if (named !== null) {
    const read = readLeadingAmount(named[2] ?? '');
    if (read.amount !== null && read.rest === '') {
      // "make it 2" names no food, so "it" must not be looked up as one
      const hint = named[1] === undefined || named[1] === 'it' ? null : named[1];
      return { kind: 'correction', amount: { amount: read.amount, unit: read.unit }, foodHint: hint };
    }
  }

  // "actually 250 ml" or "no, it was 250 ml of milk"
  const lead = CORRECTION_LEAD.exec(clean);
  if (lead === null) {
    return null;
  }
  const read = readLeadingAmount(clean.slice(lead[0].length));

  // Without a number this is not a correction ("no sugar" is a food note, not an amount)
  if (read.amount === null) {
    return null;
  }

  // Return the amount, with the food name if one followed it
  return {
    kind: 'correction',
    amount: { amount: read.amount, unit: read.unit },
    foodHint: read.rest === '' ? null : read.rest,
  };
}

/**
 * Return a draft meal with one item per separated piece of text.
 */
function parseMeal(clean: string, foods: readonly FoodVersion[]): ParseResult {
  // Strip "i had" and "for breakfast", which are not foods
  const body = clean.replace(LEAD_IN, '').replace(MEAL_SUFFIX, '').replace(/[.!?]+$/, '');

  // Split into items
  const parts: string[] = [];
  for (const part of body.split(ITEM_SEPARATOR).map((text) => text.trim()).filter((text) => text !== '')) {
    // "milk, actually 300 ml": a correction split off by the comma belongs to the item before it
    const lead = CORRECTION_LEAD.exec(part);
    const previous = parts.length - 1;
    if (lead !== null && previous >= 0 && readLeadingAmount(part.slice(lead[0].length)).amount !== null) {
      parts[previous] = `${parts[previous]} actually ${part.slice(lead[0].length)}`;
      continue;
    }
    parts.push(part);
  }

  // Read each item
  const items = parts.map((part) => parseItem(part, foods));

  // Return unknown if nothing at all could be read
  if (items.length === 0) {
    return { kind: 'unknown', text: clean };
  }
  return { kind: 'meal', items };
}

/**
 * Return one draft item ("300 ml milk", "2 weetabix", "a mug of milk").
 */
function parseItem(part: string, foods: readonly FoodVersion[]): DraftItem {
  const read = readCorrectedAmount(part);

  // "mug of milk": the container is not a unit, so the amount stays open
  const container = read.unit === null ? /^(\w+)\s+of\s+(.+)$/.exec(read.rest) : null;
  const name = container?.[2] ?? read.rest;
  const typedAmount = read.amount === null || container !== null ? null : { amount: read.amount, unit: read.unit };

  // Look the name up among saved foods
  const matches = findFoods(name, foods);
  if (matches.length === 0) {
    return { text: part, food: null, quantity: null, typedAmount, problem: `No saved food called "${name}".` };
  }
  if (matches.length > 1) {
    return { text: part, food: null, quantity: null, typedAmount, problem: `"${name}" matches ${matches.length} foods; pick one.` };
  }
  const food = matches[0]!;

  // A unit was typed: it must fit the label ("300 g" cannot describe a millilitre label)
  if (read.amount !== null && read.unit !== null) {
    if (!areCompatible(read.unit, food.basis.unit)) {
      return { text: part, food, quantity: null, typedAmount, problem: `${food.name} is measured in ${food.basis.unit}; enter the amount in that unit.` };
    }
    return { text: part, food, quantity: { amount: read.amount, unit: read.unit }, typedAmount, problem: null };
  }

  // A bare count works for foods counted in pieces ("2 weetabix")
  if (read.amount !== null && container === null && food.basis.unit === 'piece') {
    return { text: part, food, quantity: { amount: read.amount, unit: 'piece' }, typedAmount, problem: null };
  }

  // Otherwise the amount is still open
  const problem =
    container !== null
      ? `How much was the ${container[1]}? Enter the amount in ${food.basis.unit}.`
      : `Enter how much ${food.name}, in ${food.basis.unit}.`;
  return { text: part, food, quantity: null, typedAmount, problem };
}

/**
 * Return an item's amount and name, letting a later "actually 300ml" replace the first amount.
 *
 * "250ml of milk actually 300ml" gives 300, mL and "milk". When only a number
 * follows ("2 weetabix no 3"), the first unit is kept.
 */
function readCorrectedAmount(part: string): { amount: number | null; unit: Unit | null; rest: string } {
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

/**
 * Return a leading number and unit read from the text, plus the rest of the text.
 *
 * "300ml milk" and "300 ml of milk" both give 300, mL and "milk".
 */
function readLeadingAmount(text: string): { amount: number | null; unit: Unit | null; rest: string } {
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
