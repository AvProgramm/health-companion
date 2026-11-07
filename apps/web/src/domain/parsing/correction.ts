/**
 * Corrections to something already logged ("actually 250 ml", "change the milk to 200ml").
 */
import { readLeadingAmount } from './amounts';
import type { ParseResult } from './types';

// "actually 250 ml", "no, it was 250 ml of milk", "sorry make it 2"
// The words may repeat ("no, actually") and a number may follow with no space ("actually250"),
// but a longer word is not a correction ("nothing" is not "no")
export const CORRECTION_LEAD = /^(?:(?:actually|no|nope|sorry|oops|wait|correction)(?![a-z])[\s,.:;!-]*)+(?:(?:it\s+)?was\s+|it'?s\s+|make\s+it\s+|i\s+had\s+|only\s+)?/;

// "change the milk to 250 ml", "make the milk 250ml"
const CHANGE_TARGET = /^(?:change|make|set)\s+(?:the\s+|my\s+)?(.+?)\s+(?:to\s+)?(\d+(?:\.\d+)?\s*[a-z]*)$/;

/**
 * Return a correction ("actually 250 ml of milk"), or null if the text is not one.
 */
export function parseCorrection(clean: string): ParseResult | null {
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
  return { kind: 'correction', amount: { amount: read.amount, unit: read.unit }, foodHint: read.rest === '' ? null : read.rest };
}
