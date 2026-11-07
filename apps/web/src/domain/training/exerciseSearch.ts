import type { Capability, Category, Equipment, MovementCard } from './catalogue';
import { assertMovementCard } from './customCards';

// Twelve visible matches keep typing and keyboard navigation manageable on a phone.
const SEARCH_LIMIT = 12;

/** Describe a build-time exercise mapping with explicit unknown fields. */
export interface ExerciseEntry {
  id: string;
  name: string;
  category: Category | null;
  equipment: readonly Equipment[] | null;
  requires: readonly Capability[] | null;
  minutes: number;
  cue: string;
  primaryMuscles: readonly string[];
  imagePath: null;
  sourceEquipment: string | null;
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

/** Return a planner card only after every unknown mapping has been reviewed. */
export function reviewExercise(entry: ExerciseEntry, review: {
  category: Category | null; equipment: readonly Equipment[] | null; requires: readonly Capability[] | null; minutes: number;
}): MovementCard {
  const card = { id: entry.id, name: entry.name, cue: entry.cue, primaryMuscles: [...entry.primaryMuscles], imagePath: null, ...review };
  assertMovementCard(card);
  return card;
}
