/**
 * Meals ("2 weetabix and 300 ml milk"): split into items, then match each to a saved food.
 */
import { findFoods } from '../nutrition/foods';
import type { FoodVersion } from '../nutrition/types';
import { areCompatible } from '../shared/units';
import { readCorrectedAmount, readLeadingAmount } from './amounts';
import { CORRECTION_LEAD } from './correction';
import type { DraftItem, ParseResult } from './types';

// Lead-in words that do not name a food ("i had", "ate", ...)
const LEAD_IN = /^(?:i\s+)?(?:had|ate|drank|have|having|log|add)\s+/;

// A trailing meal name ("for breakfast") that is not part of the food
const MEAL_SUFFIX = /\s+(?:for|at)\s+(?:breakfast|lunch|dinner|supper|brunch|snack)$/;

// Separators between items: commas, plus signs, "and", "with", "plus"
const ITEM_SEPARATOR = /\s*(?:,|\+|&|\band\b|\bwith\b|\bplus\b)\s*/;

/**
 * Return a draft meal with one item per separated piece of text.
 *
 * This is the last parser in the chain, so it always returns a result.
 */
export function parseMeal(clean: string, foods: readonly FoodVersion[]): ParseResult {
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

  // Return unknown if nothing at all could be read
  if (parts.length === 0) {
    return { kind: 'unknown', text: clean };
  }
  return { kind: 'meal', items: parts.map((part) => parseItem(part, foods)) };
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
