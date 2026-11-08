/**
 * Ready-made training days: a reviewed list of library exercises, cut to a difficulty and a setting.
 *
 * Each pack lists real exercises from the bundled library in a reviewed order, compound
 * movements first. Nothing is generated: a session can only contain listed exercises,
 * filtered by the source's own level and the equipment the setting has. The home lists
 * leave out dumbbell exercises that need a bench, because the source does not say so.
 */
import { EMPTY_PROFILE, type Profile } from '../profile/profile';
import { ineligibleReason } from './eligibility';
import type { Category, Equipment } from './catalogue';
import { EXERCISE_EQUIPMENT } from './customCards';
import { whyNotAddable, type ExerciseEntry, type ExerciseLevel } from './exerciseSearch';

export type Difficulty = 'easy' | 'medium' | 'hard';
export type Setting = 'bodyweight' | 'home' | 'gym';

/** Describe one ready-made day. */
export interface Pack {
  id: string;
  name: string;
  categories: readonly Category[];
  exerciseIds: readonly string[];
}

/** Describe one exercise of a pack session, with its planning volume. */
export interface PackExercise {
  entry: ExerciseEntry;
  sets: number;
  minutes: number;
}

/** Describe a pack cut to a difficulty and a setting. */
export interface PackSession {
  exercises: PackExercise[];
  minutes: number;
  // How many exercises the difficulty asks for that nothing in the pack could fill
  missing: number;
}

// How each difficulty changes a pack: the levels allowed (preferred first), how many exercises, and the volume.
// Two minutes per set covers the work and the rest between sets, as a planning default, not a prescription.
export const DIFFICULTIES: Record<Difficulty, { label: string; levels: readonly ExerciseLevel[]; exercises: number; sets: number; minutesPerExercise: number }> = {
  easy: { label: 'Easy', levels: ['beginner'], exercises: 4, sets: 2, minutesPerExercise: 4 },
  medium: { label: 'Medium', levels: ['intermediate', 'beginner'], exercises: 5, sets: 3, minutesPerExercise: 6 },
  hard: { label: 'Hard', levels: ['expert', 'intermediate', 'beginner'], exercises: 6, sets: 4, minutesPerExercise: 8 },
};

// Where the session happens, as the equipment it can use; a gym is assumed to have benches too
export const SETTINGS: Record<Setting, { label: string; equipment: readonly Equipment[] }> = {
  bodyweight: { label: 'No equipment', equipment: [] },
  home: { label: 'Home kit', equipment: ['dumbbells', 'band', 'kettlebells', 'pull_up_bar'] },
  gym: { label: 'Gym', equipment: EXERCISE_EQUIPMENT },
};

// The library's ID prefix, so the lists below stay readable
const LIBRARY = 'free-exercise-db:';

// Reviewed leg exercises, the main lift for each muscle first
const LEG_IDS = ['Barbell_Squat', 'Romanian_Deadlift', 'Barbell_Full_Squat', 'Leg_Press', 'Goblet_Squat', 'Dumbbell_Squat',
  'Stiff-Legged_Dumbbell_Deadlift', 'Dumbbell_Lunges', 'Split_Squat_with_Dumbbells', 'Kettlebell_One-Legged_Deadlift', 'Dumbbell_Rear_Lunge',
  'Calf_Raise_On_A_Dumbbell', 'Standing_Calf_Raises', 'Kettlebell_Pistol_Squat', 'Bodyweight_Squat', 'Butt_Lift_Bridge',
  'Single_Leg_Glute_Bridge', 'Glute_Kickback', 'Squats_-_With_Bands', 'Calf_Raises_-_With_Bands', 'Freehand_Jump_Squat', 'Split_Jump'];

// Reviewed push exercises; dumbbell presses that need a bench are left out on purpose
const PUSH_IDS = ['Barbell_Bench_Press_-_Medium_Grip', 'Standing_Military_Press', 'Barbell_Incline_Bench_Press_-_Medium_Grip',
  'Dumbbell_Floor_Press', 'Standing_Dumbbell_Press', 'Alternating_Floor_Press', 'Kettlebell_Arnold_Press', 'Pushups',
  'Pushups_Close_and_Wide_Hand_Positions', 'Push_Up_to_Side_Plank', 'Isometric_Wipers', 'Clock_Push-Up', 'Single-Arm_Push-Up',
  'Side_Lateral_Raise', 'Tricep_Dumbbell_Kickback', 'Shoulder_Press_-_With_Bands', 'Triceps_Pushdown', 'Cable_Crossover'];

// Reviewed pull exercises; every one needs a bar, a band or weights
const PULL_IDS = ['Pullups', 'Chin-Up', 'Bent_Over_Barbell_Row', 'Wide-Grip_Lat_Pulldown', 'Bent_Over_Two-Dumbbell_Row',
  'One-Arm_Kettlebell_Row', 'Two-Arm_Kettlebell_Row', 'Alternating_Renegade_Row', 'Face_Pull', 'Band_Pull_Apart',
  'Upright_Row_-_With_Bands', 'Barbell_Curl', 'Dumbbell_Bicep_Curl', 'Hammer_Curls', 'Dumbbell_Shrug'];

// Reviewed core exercises, floor work first
const CORE_IDS = ['Plank', 'Dead_Bug', 'Side_Bridge', 'Cross-Body_Crunch', 'Reverse_Crunch', 'Air_Bike', 'Spider_Crawl',
  'Frog_Sit-Ups', 'Hanging_Leg_Raise', 'Cable_Crunch', 'Pallof_Press', 'Dumbbell_Side_Bend', 'Kettlebell_Windmill'];

// The ready-made days; a full-body day draws on all four lists
export const PACKS: readonly Pack[] = [
  { id: 'legs', name: 'Leg day', categories: ['legs'], exerciseIds: LEG_IDS.map(id => LIBRARY + id) },
  { id: 'push', name: 'Push day', categories: ['push'], exerciseIds: PUSH_IDS.map(id => LIBRARY + id) },
  { id: 'pull', name: 'Pull day', categories: ['pull'], exerciseIds: PULL_IDS.map(id => LIBRARY + id) },
  { id: 'core', name: 'Core', categories: ['core'], exerciseIds: CORE_IDS.map(id => LIBRARY + id) },
  { id: 'full_body', name: 'Full body', categories: ['legs', 'push', 'pull', 'core'],
    exerciseIds: [...LEG_IDS, ...PUSH_IDS, ...PULL_IDS, ...CORE_IDS].map(id => LIBRARY + id) },
];

/**
 * Return the level a pack treats an exercise as.
 *
 * An exercise that needs a pull-up or jumping is never treated as beginner, because
 * not everyone starting out can do one; a missing level counts as intermediate.
 */
function packLevel(entry: ExerciseEntry): ExerciseLevel {
  if (entry.level === null) return 'intermediate';
  return entry.level === 'beginner' && entry.requires.length > 0 ? 'intermediate' : entry.level;
}

/**
 * Return up to count items, taking rounds of one item per key, so no key gets two before every key has one.
 *
 * Each round takes the next unchosen item for every key, in the order given.
 * The chosen items keep that order too, so the hardest exercises stay first.
 */
function spread<T>(items: readonly T[], count: number, key: (item: T) => string): T[] {
  const chosen = new Set<T>();

  // Repeat rounds until the session is full or every item has been taken
  while (chosen.size < Math.min(count, items.length)) {
    const takenThisRound = new Set<string>();
    for (const item of items) {
      // Ignore an item already chosen, or a second item for a key this round, because it would unbalance the session
      if (chosen.has(item) || takenThisRound.has(key(item)) || chosen.size === count) continue;
      chosen.add(item);
      takenThisRound.add(key(item));
    }
  }
  return items.filter(item => chosen.has(item));
}

/**
 * Return a pack cut to a difficulty and a setting, or an honest shortfall.
 *
 * Steps: keep the listed exercises the library can plan, the setting's equipment allows and
 * the difficulty's levels include; put the preferred level first, keeping the reviewed order
 * within a level; then spread over different muscles (or areas, for a full-body day).
 */
export function buildPack(packId: string, difficulty: Difficulty, setting: Setting, entries: readonly ExerciseEntry[], profile: Profile = EMPTY_PROFILE): PackSession {
  const pack = PACKS.find(item => item.id === packId);
  if (pack === undefined) {
    throw new Error('Choose one of the listed training days.');
  }
  const rule = DIFFICULTIES[difficulty];
  const equipment = SETTINGS[setting].equipment;
  const byId = new Map(entries.map(entry => [entry.id, entry]));

  // Keep listed exercises that can be planned, fit the setting and suit the difficulty
  const fitting = pack.exerciseIds.map(id => byId.get(id)).filter((entry): entry is ExerciseEntry => entry !== undefined
    && whyNotAddable(entry) === null && entry.equipment!.every(item => equipment.includes(item)) && rule.levels.includes(packLevel(entry))
    && ineligibleReason({ ...entry, category: entry.category!, equipment: entry.equipment!, minutes: rule.minutesPerExercise }, { minutes: 60, equipment, categories: pack.categories,
      unableTo: profile.unableTo, avoidAreas: profile.avoidAreas, seatedOnly: profile.seatedOnly, neverSuggest: [], preferences: {} }) === null);

  // Put the preferred level first; the sort is stable, so the reviewed order breaks ties
  const ordered = [...fitting].sort((a, b) => rule.levels.indexOf(packLevel(a)) - rule.levels.indexOf(packLevel(b)));

  // Spread over areas for a full-body day, and over muscles for a single-area day
  const chosen = spread(ordered, rule.exercises, entry => pack.categories.length > 1 ? entry.category! : entry.primaryMuscles[0] ?? entry.id);
  return {
    exercises: chosen.map(entry => ({ entry, sets: rule.sets, minutes: rule.minutesPerExercise })),
    minutes: chosen.length * rule.minutesPerExercise,
    missing: rule.exercises - chosen.length,
  };
}
