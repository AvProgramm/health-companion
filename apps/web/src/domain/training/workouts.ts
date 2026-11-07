/**
 * Gym sets and timed activities.
 *
 * A workout entry records what was actually performed (or that it was skipped),
 * never a plan. Loads are kept in the unit typed (kg or lb) with no conversion,
 * and "each hand" is stored as a flag, so 5 kg each hand is never shown as 10 kg.
 */
import { normaliseName } from '../nutrition/foods';
import { assertFinite, assertNonNegative, assertPositive } from '../shared/validate';

export type LoadUnit = 'kg' | 'lb';

// Upper limits that catch typing slips ("80" sets) without blocking real training
const MAX_SETS = 30;
const MAX_REPS = 500;
const MAX_MINUTES = 24 * 60;

/**
 * One set, or one block of a timed activity.
 */
export interface WorkoutSet {
  reps: number | null;
  load: number | null;
  loadUnit: LoadUnit | null;
  perHand: boolean;
  minutes: number | null;
  distanceKm: number | null;
}

/**
 * One logged session of one movement or activity.
 */
export interface WorkoutEntry {
  id: string;
  localDate: string;
  zone: string;
  savedAt: string;
  operationKey: string;
  movement: string;
  movementKey: string;
  status: 'done' | 'skipped';
  sets: WorkoutSet[];
  version: number;
  deleted?: boolean;
}

/**
 * What the parser or a form proposes, before it is checked and saved.
 */
export interface WorkoutDraft {
  movement: string;
  status: 'done' | 'skipped';
  sets: WorkoutSet[];
}

/**
 * Return a checked workout entry ready to save.
 *
 * Every number must be finite and in range; a done entry needs at least one set
 * with reps or time, so an empty "done" can never count as training.
 */
export function buildWorkout(
  draft: WorkoutDraft,
  ids: { id: string; operationKey: string; localDate: string; zone: string; savedAt: string },
): WorkoutEntry {
  // Check the movement name
  const movement = draft.movement.trim();
  if (movement === '') {
    throw new Error('Name the exercise or activity');
  }

  // Check the sets of a performed session
  if (draft.status === 'done') {
    if (draft.sets.length === 0 || draft.sets.length > MAX_SETS) {
      throw new RangeError(`A session needs between 1 and ${MAX_SETS} sets`);
    }
    draft.sets.forEach((set, index) => checkSet(set, index + 1));
  }

  // Return version 1 of the entry; a skipped day keeps no sets
  return {
    ...ids,
    movement,
    movementKey: movementKey(movement),
    status: draft.status,
    sets: draft.status === 'skipped' ? [] : draft.sets.map((set) => ({ ...set })),
    version: 1,
  };
}

/**
 * Throw unless one set is complete and every number in it is sensible.
 */
function checkSet(set: WorkoutSet, number: number): void {
  const label = `Set ${number}`;

  // A set needs reps or a time; distance alone is not enough to know what was done
  if (set.reps === null && set.minutes === null) {
    throw new Error(`${label} needs reps or a time`);
  }
  if (set.reps !== null) {
    assertPositive(set.reps, `${label} reps`);
    if (!Number.isInteger(set.reps) || set.reps > MAX_REPS) {
      throw new RangeError(`${label} reps must be a whole number up to ${MAX_REPS}`);
    }
  }
  if (set.minutes !== null) {
    assertPositive(set.minutes, `${label} minutes`);
    if (set.minutes > MAX_MINUTES) {
      throw new RangeError(`${label} cannot be longer than a day`);
    }
  }

  // A load needs its unit, so 5 can never be read as kg on one day and lb on another
  if (set.load !== null) {
    assertNonNegative(set.load, `${label} load`);
    if (set.loadUnit === null) {
      throw new Error(`${label} load needs kg or lb`);
    }
  }
  if (set.distanceKm !== null) {
    assertFinite(set.distanceKm, `${label} distance`);
    assertNonNegative(set.distanceKm, `${label} distance`);
  }
}

/**
 * Return the key used to find earlier sessions of the same movement ("Rows" → "row").
 */
export function movementKey(movement: string): string {
  return normaliseName(movement)
    .split(' ')
    .map((word) => (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word))
    .join(' ');
}

/**
 * Return the most recent performed session of a movement, or undefined if there is none.
 *
 * Skipped and deleted entries are left out, so "last time" always means a session
 * that actually happened.
 */
export function lastPerformed(entries: readonly WorkoutEntry[], key: string): WorkoutEntry | undefined {
  return entries
    .filter((entry) => entry.movementKey === key && entry.status === 'done' && entry.deleted !== true)
    .sort((a, b) => (a.localDate === b.localDate ? b.savedAt.localeCompare(a.savedAt) : b.localDate.localeCompare(a.localDate)))[0];
}

/**
 * Return a session's sets as text, grouping identical sets: "3 × 8 @ 5 kg each hand".
 */
export function describeSets(entry: Pick<WorkoutEntry, 'status' | 'sets'>): string {
  if (entry.status === 'skipped') {
    return 'Skipped';
  }

  // Group runs of identical consecutive sets
  const groups: { set: WorkoutSet; count: number }[] = [];
  for (const set of entry.sets) {
    const last = groups.at(-1);
    if (last !== undefined && sameSet(last.set, set)) {
      last.count += 1;
    } else {
      groups.push({ set, count: 1 });
    }
  }

  // Return each group as "count × reps @ load", or "minutes · distance" for timed work
  return groups.map(({ set, count }) => describeOne(set, count)).join(', ');
}

/**
 * Return one group of identical sets as text.
 */
function describeOne(set: WorkoutSet, count: number): string {
  const parts: string[] = [];
  if (set.reps !== null) {
    parts.push(count > 1 ? `${count} × ${set.reps}` : `${set.reps} reps`);
  } else if (count > 1) {
    parts.push(`${count} ×`);
  }
  if (set.load !== null && set.loadUnit !== null) {
    parts.push(`@ ${trim(set.load)} ${set.loadUnit}${set.perHand ? ' each hand' : ''}`);
  }
  // Time and distance read as "30 min · 5 km"
  const timed: string[] = [];
  if (set.minutes !== null) {
    timed.push(`${trim(set.minutes)} min`);
  }
  if (set.distanceKm !== null) {
    timed.push(`${trim(set.distanceKm)} km`);
  }
  if (timed.length > 0) {
    parts.push(timed.join(' · '));
  }
  return parts.join(' ');
}

/**
 * Return true if two sets would be written the same way.
 */
function sameSet(a: WorkoutSet, b: WorkoutSet): boolean {
  return a.reps === b.reps && a.load === b.load && a.loadUnit === b.loadUnit && a.perHand === b.perHand && a.minutes === b.minutes && a.distanceKm === b.distanceKm;
}

/**
 * Return a number without trailing zeros (5 not 5.00, 2.5 not 2.50).
 */
function trim(value: number): string {
  return Number(value.toFixed(2)).toString();
}
