/**
 * A small, deterministic grammar for the composer.
 *
 * It never calls a model and never saves anything. It turns typed text into a
 * draft meal, a correction or a question, and the user confirms what happens next.
 * Text it cannot read is reported as such, so the screen can offer a manual form.
 */
import { findFoods, normaliseName } from './foods';
import type { ClockTime } from './sleep';
import type { FoodVersion, NutrientKey } from './types';
import { areCompatible, type Quantity, type Unit } from './units';
import type { LoadUnit, WorkoutDraft, WorkoutSet } from './workouts';

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

// Sleep words: any of these makes the text a sleep entry
const SLEEP_WORDS = /\b(?:slept|sleep|went\s+to\s+bed|to\s+bed|bed(?:time)?|woke(?:\s+up)?|got\s+up|nap(?:ped)?)\b/;

// A sleep duration the user reports ("slept 6 hours", "6h30")
const SLEEP_DURATION = /(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?)\b(?:\s*(\d{1,2})\s*(?:m|min|mins|minutes?)?\b)?/;

// A clock time: "23:30", "7", "11pm", "7.15am"
const CLOCK_TIME = /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\b/g;

// Lead-in words before a workout ("add gym:", "did")
const WORKOUT_LEAD = /^(?:add\s+)?(?:gym\s*:\s*|i\s+did\s+|did\s+)/;

// "skip gym", "rest day", "no gym today"
const WORKOUT_SKIP = /^(?:skip(?:ped)?\s+(?:the\s+)?(?:gym|workout|training)|rest\s+day|no\s+(?:gym|workout|training))\b/;

// "row 3 x 8 at 5 kg each hand"
const SETS_AFTER_NAME = /^([a-z][a-z\s'-]*?)\s+(\d+)\s*(?:x|×|sets?\s+of)\s*(\d+)(?:\s*reps?)?(.*)$/;

// "3x8 row at 5kg"
const SETS_BEFORE_NAME = /^(\d+)\s*(?:x|×|sets?\s+of)\s*(\d+)(?:\s*reps?)?\s+(?:of\s+)?([a-z][a-z\s'-]*?)((?:\s+(?:at|@|with)\b.*)?)$/;

// "pushups 20 reps": one set, recognised only with the word "reps" so "20 almonds" stays food
const REPS_ONLY = /^([a-z][a-z\s'-]*?)\s+(\d+)\s*reps?\b(.*)$/;

// A load and its unit, with "each hand" for dumbbells
const LOAD = /(\d+(?:\.\d+)?)\s*(kg|kgs|kilos?|lb|lbs|pounds?)\b/;
const PER_HAND = /\b(?:each|per)\s+(?:hand|arm|side|dumbbell)\b/;

// Timed activities, mapped to the name shown in the diary
const ACTIVITIES: readonly [RegExp, string][] = [
  [/^(?:run|ran|running|jog|jogged|jogging)\b/, 'Run'],
  [/^(?:walk|walked|walking)\b/, 'Walk'],
  [/^(?:cycle|cycled|cycling|bike|biked|biking)\b/, 'Cycle'],
  [/^(?:swim|swam|swimming)\b/, 'Swim'],
  [/^(?:hike|hiked|hiking)\b/, 'Hike'],
  [/^(?:badminton|football|futsal|basketball|tennis|yoga|pilates)\b/, ''],
];
const ACTIVITY_MINUTES = /(\d+(?:\.\d+)?)\s*(?:min|mins|minutes)\b/;
const ACTIVITY_HOURS = /(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?)\b/;
const ACTIVITY_KM = /(\d+(?:\.\d+)?)\s*(?:km|k)\b/;

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
  | { kind: 'workout'; draft: WorkoutDraft; problem: string | null }
  | { kind: 'sleep'; bed: ClockTime | null; wake: ClockTime | null; asleepMin: number | null; problem: string | null }
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

  // Sleep and training before meals, because "bed at 11" and "row 3x8" are not foods
  const sleep = parseSleep(clean);
  if (sleep !== null) {
    return sleep;
  }
  const workout = parseWorkout(clean, foods);
  if (workout !== null) {
    return workout;
  }

  // Everything else is read as a meal
  return parseMeal(clean, foods);
}

/**
 * Return a sleep entry ("slept 23:30 to 07:00", "bed at 11, up at 7"), or null if the text is not about sleep.
 *
 * The first clock time is bed and the second is waking. A reported duration
 * ("slept 6 hours") is kept as time asleep, never used to invent the times.
 */
function parseSleep(clean: string): ParseResult | null {
  if (!SLEEP_WORDS.test(clean)) {
    return null;
  }

  // Take out a reported duration first, so "6 hours" is not read as 6 o'clock
  const duration = SLEEP_DURATION.exec(clean);
  const asleepMin = duration === null ? null : Math.round(Number(duration[1]) * 60 + Number(duration[2] ?? 0));
  const rest = duration === null ? clean : clean.replace(duration[0], ' ');

  // Read the clock times in the order they were written
  const times: ClockTime[] = [...rest.matchAll(CLOCK_TIME)].map((match) => ({
    hour: Number(match[1]),
    minute: Number(match[2] ?? 0),
    meridiem: (match[3] as 'am' | 'pm' | undefined) ?? null,
  }));
  const bed = times.length >= 2 ? times[0]! : null;
  const wake = times.length >= 2 ? times[1]! : times.length === 1 && /\b(?:woke|got\s+up|up)\b/.test(rest) ? times[0]! : null;

  // Say what is still missing; time in bed needs both ends
  let problem: string | null = null;
  if (bed === null || wake === null) {
    problem = bed === null && wake === null ? 'Add when you went to bed and when you woke up.' : 'Add when you went to bed.';
  }
  return { kind: 'sleep', bed, wake, asleepMin, problem };
}

/**
 * Return a workout ("row 3 x 8 at 5 kg each hand", "ran 5 km in 30 min", "rest day"),
 * or null if the text is not about training.
 */
function parseWorkout(clean: string, foods: readonly FoodVersion[]): ParseResult | null {
  const body = clean.replace(WORKOUT_LEAD, '').replace(/[.!]+$/, '');

  // A skipped day is a record too, so tomorrow's plan can see it
  if (WORKOUT_SKIP.test(body)) {
    return { kind: 'workout', draft: { movement: 'Gym', status: 'skipped', sets: [] }, problem: null };
  }

  // Sets and reps, with the name before or after them
  const after = SETS_AFTER_NAME.exec(body);
  const before = after === null ? SETS_BEFORE_NAME.exec(body) : null;
  const repsOnly = after === null && before === null ? REPS_ONLY.exec(body) : null;
  const strength = after !== null
    ? { name: after[1]!, sets: Number(after[2]), reps: Number(after[3]), tail: after[4] ?? '' }
    : before !== null
      ? { name: before[3]!, sets: Number(before[1]), reps: Number(before[2]), tail: before[4] ?? '' }
      : repsOnly !== null
        ? { name: repsOnly[1]!, sets: 1, reps: Number(repsOnly[2]), tail: repsOnly[3] ?? '' }
        : null;

  // Ignore a name that is a saved food ("2 x 2 eggs" is breakfast, not a lift)
  if (strength !== null && findFoods(strength.name, foods).length === 0) {
    const load = LOAD.exec(strength.tail);
    const set: WorkoutSet = {
      reps: strength.reps,
      load: load === null ? null : Number(load[1]),
      loadUnit: load === null ? null : loadUnit(load[2]!),
      perHand: PER_HAND.test(strength.tail),
      minutes: null,
      distanceKm: null,
    };
    const sets = Array.from({ length: strength.sets }, () => ({ ...set }));
    return { kind: 'workout', draft: { movement: capitalise(strength.name.trim()), status: 'done', sets }, problem: null };
  }

  // Timed activities: time and distance in any order
  for (const [pattern, name] of ACTIVITIES) {
    const activity = pattern.exec(body);
    if (activity === null) {
      continue;
    }
    const minutesMatch = ACTIVITY_MINUTES.exec(body);
    const hoursMatch = minutesMatch === null ? ACTIVITY_HOURS.exec(body) : null;
    const kmMatch = ACTIVITY_KM.exec(body);
    const minutes = minutesMatch !== null ? Number(minutesMatch[1]) : hoursMatch !== null ? Number(hoursMatch[1]) * 60 : null;
    const set: WorkoutSet = { reps: null, load: null, loadUnit: null, perHand: false, minutes, distanceKm: kmMatch === null ? null : Number(kmMatch[1]) };
    return {
      kind: 'workout',
      draft: { movement: name === '' ? capitalise(activity[0]) : name, status: 'done', sets: [set] },
      problem: minutes === null ? 'Add how long it took, e.g. "30 min".' : null,
    };
  }

  return null;
}

/**
 * Return the load unit for a typed word ("kgs" → kg, "pounds" → lb).
 */
function loadUnit(word: string): LoadUnit {
  return word.startsWith('k') ? 'kg' : 'lb';
}

/**
 * Return text with its first letter in capitals ("row" → "Row").
 */
function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
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
