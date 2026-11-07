/**
 * What the composer grammar can return.
 */
import type { NutrientKey, FoodVersion } from '../nutrition/types';
import type { Quantity, Unit } from '../shared/units';
import type { ClockTime } from '../sleep/sleep';
import type { WorkoutDraft } from '../training/workouts';

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
 * One parser in the chain: it either recognises the cleaned text or returns null.
 */
export type EntryParser = (clean: string, foods: readonly FoodVersion[]) => ParseResult | null;
