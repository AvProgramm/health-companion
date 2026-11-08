import type { BodyArea, Position } from '../profile/profile';
import type { Category, Capability, Equipment, MovementCard } from './catalogue';
import { assertMovementCard } from './customCards';

// Twelve visible matches keep typing and keyboard navigation manageable on a phone.
const SEARCH_LIMIT = 12;

// The source's own difficulty levels, easiest first
export type ExerciseLevel = 'beginner' | 'intermediate' | 'expert';

/** Describe a build-time exercise mapping with explicit unknown fields. */
export interface ExerciseEntry {
  loads?: readonly BodyArea[] | null;
  positions?: readonly Position[] | null;
  id: string;
  name: string;
  category: Category | null;
  // Null when the source names equipment the planner cannot check
  equipment: readonly Equipment[] | null;
  // What the instructions need that the planner cannot check, e.g. "a decline bench"
  untracked: string | null;
  // The abilities the source gives evidence for: a pull-up in the name, or a jump
  requires: readonly Capability[];
  minutes: number;
  cue: string;
  primaryMuscles: readonly string[];
  imagePath: null;
  sourceEquipment: string | null;
  level: ExerciseLevel | null;
}

/** Return normalised search text without losing word boundaries. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Return deterministic local matches without performing any network request. */
export function searchExercises(entries: readonly ExerciseEntry[], query: string): ExerciseEntry[] {
  const words = normalise(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return entries.filter(entry => {
    const text = normalise([entry.name, ...entry.primaryMuscles, entry.sourceEquipment ?? ''].join(' '));
    return words.every(word => text.includes(word));
  }).sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)).slice(0, SEARCH_LIMIT);
}

/**
 * Return why an exercise cannot enter the planner, or null when it can.
 *
 * The planner can only check what the source states, so an unknown fact blocks the exercise
 * rather than being filled in by the person or guessed.
 */
export function whyNotAddable(entry: ExerciseEntry): string | null {
  // Ignore an exercise without a planner area because a plan could not count its coverage
  if (entry.category === null) {
    return 'Its muscles do not map to push, pull, legs or core, so the planner cannot place it.';
  }
  // Ignore an exercise whose instructions need something the planner cannot check
  if (entry.equipment === null && entry.untracked !== null) {
    return `It needs ${entry.untracked}, which the planner cannot check yet.`;
  }
  // Ignore equipment the source leaves vague, such as "other"
  if (entry.equipment === null) {
    return 'The source does not say what equipment it needs, so the planner cannot check it.';
  }
  return null;
}

/**
 * Return a planner card from the source's facts and the person's planning block.
 *
 * Category, equipment and needs come from the source and cannot be edited here;
 * only the planning block is the person's choice.
 */
export function reviewExercise(entry: ExerciseEntry, minutes: number): MovementCard {
  // Refuse an exercise with an unknown fact before building a card from it
  const blocked = whyNotAddable(entry);
  if (blocked !== null) {
    throw new Error(blocked);
  }
  const card = { id: entry.id, name: entry.name, cue: entry.cue, primaryMuscles: [...entry.primaryMuscles], imagePath: null,
    loads: entry.loads ?? null, positions: entry.positions ?? null,
    category: entry.category, equipment: entry.equipment, requires: entry.requires, minutes };
  assertMovementCard(card);
  return card;
}
