import { BODY_AREAS, POSITIONS, type BodyArea } from '../profile/profile';
import type { Capability, Category, Equipment, MovementCard } from './catalogue';

// Marks an exercise the person described, as opposed to one chosen from the library.
export const OWN_EXERCISE_PREFIX = 'own:';
// Long enough for any exercise name, short enough to read in a plan on a phone.
const MAX_OWN_NAME = 80;
// Shown under Instructions when the person left them blank.
const NO_INSTRUCTIONS = 'Added by you. No instructions were written.';
// Twenty-four choices plus the reviewed starter sets bound the pool searched on the phone.
export const MAX_CUSTOM_CARDS = 24;
// These are the existing planner categories, not new exercise safety rules.
export const EXERCISE_CATEGORIES: readonly Category[] = ['push', 'pull', 'legs', 'core'];
// Every equipment type the planner can check; anything else stays unknown and cannot be added.
export const EXERCISE_EQUIPMENT: readonly Equipment[] = ['dumbbells', 'band', 'pull_up_bar', 'kettlebells', 'barbell', 'ez_curl_bar',
  'cable', 'machine', 'medicine_ball', 'exercise_ball', 'foam_roll'];
// The dataset does not describe these requirements; the person explicitly reviews them.
export const EXERCISE_CAPABILITIES: readonly Capability[] = ['pull_up', 'jumping'];

/** Where an exercise's facts came from: the pinned library, or the person. */
export type ExerciseOrigin = { dataset: 'free-exercise-db'; revision: string } | { dataset: 'own' };

/** What the person fills in to describe an exercise the library does not have. */
export interface OwnExerciseDraft {
  name: string;
  category: Category;
  equipment: readonly Equipment[];
  minutes: number;
  cue: string;
  requires: readonly Capability[];
  seated: boolean;
  loads: readonly BodyArea[];
}

/** Describe one immutable version of a chosen exercise. */
export interface CustomCardSelection {
  id: string;
  version: number;
  operationKey: string;
  savedAt: string;
  deleted: boolean;
  card: MovementCard;
  source: ExerciseOrigin;
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
  if (!record(value) || typeof value.id !== 'string' || !(value.id.startsWith('free-exercise-db:') || value.id.startsWith(OWN_EXERCISE_PREFIX)) || value.id.length > 200 ||
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
  // Ignore malformed optional tags because old unknown facts may remain null but invented facts cannot pass restore.
  if ((value.loads != null && !choiceList(value.loads, BODY_AREAS)) || (value.positions != null && !choiceList(value.positions, POSITIONS))) {
    throw new Error('Keep load and position tags as listed, reviewed movement facts.');
  }
  if (value.imagePath !== undefined && value.imagePath !== null) {
    throw new Error('Use the bundled muscle illustration for this exercise.');
  }
}

/**
 * Return a planner card for an exercise the person described.
 *
 * The ID is passed in, so the same draft retried keeps the same exercise. A fact left
 * blank stays unknown rather than becoming "none", so an active adaptation leaves it out.
 */
export function ownExerciseCard(draft: OwnExerciseDraft, id: string): MovementCard {
  const name = draft.name.trim();

  // Ignore a missing name because a plan could not say what to do
  if (name === '' || name.length > MAX_OWN_NAME) {
    throw new Error(`Enter the exercise name, up to ${MAX_OWN_NAME} characters.`);
  }

  // Build the card and hold it to the same checks as a library exercise
  const card: MovementCard = { id: `${OWN_EXERCISE_PREFIX}${id}`, name, category: draft.category, minutes: draft.minutes, equipment: [...draft.equipment], requires: [...draft.requires],
    cue: draft.cue.trim() || NO_INSTRUCTIONS, primaryMuscles: [], imagePath: null, positions: draft.seated ? ['seated'] : null, loads: draft.loads.length > 0 ? [...draft.loads] : null };
  assertMovementCard(card);
  return card;
}

/** Return whether a saved source matches the kind of exercise it belongs to. */
function validSource(value: unknown, id: string): boolean {
  if (!record(value)) return false;

  // An exercise the person described has no library revision to record
  if (id.startsWith(OWN_EXERCISE_PREFIX)) return value.dataset === 'own';
  return value.dataset === 'free-exercise-db' && typeof value.revision === 'string' && /^[a-f0-9]{40}$/.test(value.revision);
}

/** Reject a malformed saved selection or backup snapshot. */
export function assertCustomCard(value: unknown): asserts value is CustomCardSelection {
  if (!record(value)) throw new Error('This exercise choice is not a record.');
  assertMovementCard(value.card);
  if (value.id !== value.card.id || typeof value.version !== 'number' || !Number.isInteger(value.version) || value.version < 1 ||
      typeof value.operationKey !== 'string' || value.operationKey.trim() === '' || value.operationKey.length > 160 ||
      typeof value.savedAt !== 'string' || !Number.isFinite(Date.parse(value.savedAt)) || typeof value.deleted !== 'boolean' ||
      !validSource(value.source, value.id)) {
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
