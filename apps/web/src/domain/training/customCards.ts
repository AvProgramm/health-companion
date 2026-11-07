import type { Capability, Category, Equipment, MovementCard } from './catalogue';

// Twenty-four choices plus eight starter cards bound the pool searched on the phone.
export const MAX_CUSTOM_CARDS = 24;
// These are the existing planner categories, not new exercise safety rules.
export const EXERCISE_CATEGORIES: readonly Category[] = ['push', 'pull', 'legs', 'core'];
// Unsupported imported equipment must be reviewed instead of silently becoming bodyweight.
export const EXERCISE_EQUIPMENT: readonly Equipment[] = ['dumbbells', 'band', 'pull_up_bar'];
// The dataset does not describe these requirements; the person explicitly reviews them.
export const EXERCISE_CAPABILITIES: readonly Capability[] = ['pull_up', 'jumping'];

/** Describe one immutable version of a chosen exercise. */
export interface CustomCardSelection {
  id: string;
  version: number;
  operationKey: string;
  savedAt: string;
  deleted: boolean;
  card: MovementCard;
  source: { dataset: 'free-exercise-db'; revision: string };
}

/** Return whether a value is a plain record. */
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Return whether a value is a unique list of supported choices. */
function choiceList(value: unknown, choices: readonly string[]): boolean {
  return Array.isArray(value) && value.every(item => typeof item === 'string' && choices.includes(item)) && new Set(value).size === value.length;
}

/** Reject incomplete cards before a selection can enter the planner. */
export function assertMovementCard(value: unknown): asserts value is MovementCard {
  if (!record(value) || typeof value.id !== 'string' || !value.id.startsWith('free-exercise-db:') || value.id.length > 200 ||
      typeof value.name !== 'string' || value.name.trim() === '' || value.name.length > 160 ||
      typeof value.cue !== 'string' || value.cue.trim() === '' || value.cue.length > 8000) {
    throw new Error('Review the exercise name and instructions before adding it.');
  }
  // Ignore an incomplete mapping because an unknown requirement is not an empty list.
  if (!EXERCISE_CATEGORIES.includes(value.category as Category) || !choiceList(value.equipment, EXERCISE_EQUIPMENT) || !choiceList(value.requires, EXERCISE_CAPABILITIES)) {
    throw new Error('Review the category, equipment and capability requirements.');
  }
  if (typeof value.minutes !== 'number' || !Number.isFinite(value.minutes) || !Number.isInteger(value.minutes) || value.minutes < 1 || value.minutes > 60) {
    throw new Error('Choose a planning block from 1 to 60 whole minutes.');
  }
  if (value.primaryMuscles !== undefined && (!Array.isArray(value.primaryMuscles) || value.primaryMuscles.some(item => typeof item !== 'string' || item.length > 80))) {
    throw new Error('Keep muscle names as text from the exercise source.');
  }
  if (value.imagePath !== undefined && value.imagePath !== null) {
    throw new Error('Use the bundled muscle illustration for this exercise.');
  }
}

/** Reject a malformed saved selection or backup snapshot. */
export function assertCustomCard(value: unknown): asserts value is CustomCardSelection {
  if (!record(value)) throw new Error('This exercise choice is not a record.');
  assertMovementCard(value.card);
  if (value.id !== value.card.id || typeof value.version !== 'number' || !Number.isInteger(value.version) || value.version < 1 ||
      typeof value.operationKey !== 'string' || value.operationKey.trim() === '' || value.operationKey.length > 160 ||
      typeof value.savedAt !== 'string' || !Number.isFinite(Date.parse(value.savedAt)) || typeof value.deleted !== 'boolean' ||
      !record(value.source) || value.source.dataset !== 'free-exercise-db' || typeof value.source.revision !== 'string' || !/^[a-f0-9]{40}$/.test(value.source.revision)) {
    throw new Error('The exercise choice has invalid version, operation or source details.');
  }
}

/** Return the latest snapshot of every choice, including removed choices. */
export function latestCustomCards(records: readonly CustomCardSelection[]): CustomCardSelection[] {
  const latest = new Map<string, CustomCardSelection>();
  for (const entry of records) {
    const previous = latest.get(entry.id);
    if (previous === undefined || entry.version > previous.version) latest.set(entry.id, entry);
  }
  return [...latest.values()].sort((left, right) => left.card.name.localeCompare(right.card.name) || left.id.localeCompare(right.id));
}
