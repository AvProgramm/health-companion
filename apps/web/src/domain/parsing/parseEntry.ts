/**
 * A small, deterministic grammar for the composer.
 *
 * It never calls a model and never saves anything. It turns typed text into a
 * draft meal, a correction, a question, a workout or a sleep, and the user
 * confirms what happens next. Each kind has its own parser; they are tried in
 * order, so a new kind of entry is one new parser added to the list.
 */
import type { FoodVersion } from '../nutrition/types';
import { parseCorrection } from './correction';
import { parseMeal } from './meal';
import { parseQuestion } from './question';
import { parseSleep } from './sleepEntry';
import type { EntryParser, ParseResult } from './types';
import { parseWorkout } from './workoutEntry';

// The order matters: questions before everything ("what was my protein" is not a food),
// corrections before meals ("actually 250 ml" also looks like an item), and sleep and
// training before meals ("bed at 11" and "row 3x8" are not foods). Meals come last
// and always return a result.
const PARSERS: readonly EntryParser[] = [parseQuestion, parseCorrection, parseSleep, parseWorkout, parseMeal];

/**
 * Return what the typed text asks for, from the first parser that recognises it.
 */
export function parseEntry(text: string, foods: readonly FoodVersion[]): ParseResult {
  // Normalise case, curly apostrophes and spacing
  const clean = text.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
  if (clean === '') {
    return { kind: 'empty' };
  }

  // Return the first parser's answer
  for (const parser of PARSERS) {
    const result = parser(clean, foods);
    if (result !== null) {
      return result;
    }
  }
  return { kind: 'unknown', text: clean };
}
