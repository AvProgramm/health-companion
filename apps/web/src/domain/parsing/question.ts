/**
 * Questions about a day's totals ("how much protein today?").
 */
import type { NutrientKey } from '../nutrition/types';
import type { ParseResult } from './types';

// Openers that make a sentence a question
const QUESTION_LEAD = /^(?:how\s+much|how\s+many|what(?:'s|\s+is|\s+was|\s+were)?|show|total|did\s+i)\b/;

// Nutrient words, most specific first so "added sugar" wins over "sugar"
const NUTRIENT_WORDS: readonly [RegExp, NutrientKey][] = [
  [/\badded\s+sugars?\b/, 'added_sugar_g'],
  [/\bunsaturated\s+fats?\b/, 'unsatfat_g'],
  [/\bsat(?:urated)?\s+fat\b/, 'satfat_g'],
  [/\bprotein\b/, 'protein_g'],
  [/\b(?:carbs|carbohydrates?)\b/, 'carbs_g'],
  [/\bfib(?:re|er)\b/, 'fibre_g'],
  [/\b(?:sodium|salt)\b/, 'sodium_mg'],
  [/\b(?:calories|calorie|kcal|energy)\b/, 'kcal'],
  [/\bsugars?\b/, 'total_sugar_g'],
  [/\bfat\b/, 'fat_g'],
];

/**
 * Return a question about a day total, unknown for other questions, or null if it is not a question.
 */
export function parseQuestion(clean: string): ParseResult | null {
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
