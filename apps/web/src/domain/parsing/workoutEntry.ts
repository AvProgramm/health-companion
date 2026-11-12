/**
 * Training entries ("row 3 x 8 at 5 kg each hand", "ran 5 km in 30 min", "rest day").
 */
import { findFoods } from '../nutrition/foods';
import type { FoodVersion } from '../nutrition/types';
import type { LoadUnit, WorkoutSet } from '../training/workouts';
import type { ParseResult } from './types';

// Lead-in words before a workout ("add gym:", "did")
const WORKOUT_LEAD = /^(?:add\s+)?(?:gym\s*:\s*|i\s+did\s+|did\s+)/;

// "skip gym", "rest day", "no gym today"
const WORKOUT_SKIP = /^(?:skip(?:ped)?\s+(?:the\s+)?(?:gym|workout|training)|rest\s+day|no\s+(?:gym|workout|training))\b/;

// "row 3 x 8 at 5 kg each hand"
const SETS_AFTER_NAME = /^([a-z][a-z\s'-]*?)\s+(\d+)\s*(?:x|×|sets?\s+of)\s*(\d+)(?:\s*reps?)?(.*)$/;

// "3x8 row at 5kg"
const SETS_BEFORE_NAME = /^(\d+)\s*(?:x|×|sets?\s+of)\s*(\d+)(?:\s*reps?)?\s+(?:of\s+)?([a-z][a-z\s'-]*?)((?:\s+(?:at|@|with)\b.*)?)$/;

// "pushups 20 reps": one set, recognised only with the word "reps" so "20 almonds" stays food
const REPS_ONLY = /^([a-z][a-z\s'-]*?)\s+(\d+)\s*reps?\b(.*)$/;

// A load and its unit, with "each hand" for dumbbells
const LOAD = /(\d+(?:\.\d+)?)\s*(kg|kgs|kilos?|lb|lbs|pounds?)\b/;
const PER_HAND = /\b(?:each|per)\s+(?:hand|arm|side|dumbbell)\b/;

// Timed activities, mapped to the name shown in the diary ('' keeps the typed word)
const ACTIVITIES: readonly [RegExp, string][] = [
  [/^(?:run|ran|running|jog|jogged|jogging)\b/, 'Run'],
  [/^(?:walk|walked|walking)\b/, 'Walk'],
  [/^(?:cycle|cycled|cycling|bike|biked|biking)\b/, 'Cycle'],
  [/^(?:swim|swam|swimming)\b/, 'Swim'],
  [/^(?:hike|hiked|hiking)\b/, 'Hike'],
  [/^(?:badminton|football|futsal|basketball|tennis|yoga|pilates)\b/, ''],
];
const ACTIVITY_MINUTES = /(\d+(?:\.\d+)?)\s*(?:min|mins|minutes)\b/;
const ACTIVITY_HOURS = /(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?)\b/;
const ACTIVITY_KM = /(\d+(?:\.\d+)?)\s*(?:km|k)\b/;

// Bodyweight movements people count without the word "reps" ("20 pushups"); a short list, so "20 almonds" stays food
const COUNTED = /^(\d+)\s+(push[- ]?ups?|pull[- ]?ups?|chin[- ]?ups?|sit[- ]?ups?|squats?|lunges?|burpees?|crunches|jumping jacks|star jumps|dips|planks?)$/;
// Words left around a duration once the number is taken out ("planks for 5 min")
const DURATION_FILLER = /\b(?:for|of|in|about)\b/g;

/**
 * Return a workout, or null if the text is not about training.
 */
export function parseWorkout(clean: string, foods: readonly FoodVersion[]): ParseResult | null {
  const body = clean.replace(WORKOUT_LEAD, '').replace(/[.!]+$/, '');

  // A skipped day is a record too, so tomorrow's plan can see it
  if (WORKOUT_SKIP.test(body)) {
    return { kind: 'workout', draft: { movement: 'Gym', status: 'skipped', sets: [] }, problem: null };
  }
  return readStrength(body, foods) ?? readActivity(body) ?? readCounted(body) ?? readTimed(body, foods);
}

/**
 * Return sets and reps ("row 3 x 8 at 5 kg each hand"), or null if the text has none.
 */
function readStrength(body: string, foods: readonly FoodVersion[]): ParseResult | null {
  // Sets and reps, with the name before or after them
  const after = SETS_AFTER_NAME.exec(body);
  const before = after === null ? SETS_BEFORE_NAME.exec(body) : null;
  const repsOnly = after === null && before === null ? REPS_ONLY.exec(body) : null;
  const found = after !== null
    ? { name: after[1]!, sets: Number(after[2]), reps: Number(after[3]), tail: after[4] ?? '' }
    : before !== null
      ? { name: before[3]!, sets: Number(before[1]), reps: Number(before[2]), tail: before[4] ?? '' }
      : repsOnly !== null
        ? { name: repsOnly[1]!, sets: 1, reps: Number(repsOnly[2]), tail: repsOnly[3] ?? '' }
        : null;

  // Ignore a name that is a saved food ("2 x 2 eggs" is breakfast, not a lift)
  if (found === null || findFoods(found.name, foods).length > 0) {
    return null;
  }

  // Build identical sets with the load and "each hand" from the tail
  const load = LOAD.exec(found.tail);
  const set: WorkoutSet = {
    reps: found.reps,
    load: load === null ? null : Number(load[1]),
    loadUnit: load === null ? null : loadUnit(load[2]!),
    perHand: PER_HAND.test(found.tail),
    minutes: null,
    distanceKm: null,
  };
  const sets = Array.from({ length: found.sets }, () => ({ ...set }));
  return { kind: 'workout', draft: { movement: capitalise(found.name.trim()), status: 'done', sets }, problem: null };
}

/**
 * Return a timed activity ("ran 5 km in 30 min"), or null if the text names none.
 */
function readActivity(body: string): ParseResult | null {
  for (const [pattern, name] of ACTIVITIES) {
    const activity = pattern.exec(body);
    if (activity === null) {
      continue;
    }

    // Time and distance may come in any order
    const minutesMatch = ACTIVITY_MINUTES.exec(body);
    const hoursMatch = minutesMatch === null ? ACTIVITY_HOURS.exec(body) : null;
    const kmMatch = ACTIVITY_KM.exec(body);
    const minutes = minutesMatch !== null ? Number(minutesMatch[1]) : hoursMatch !== null ? Number(hoursMatch[1]) * 60 : null;
    const set: WorkoutSet = { reps: null, load: null, loadUnit: null, perHand: false, minutes, distanceKm: kmMatch === null ? null : Number(kmMatch[1]) };
    return {
      kind: 'workout',
      draft: { movement: name === '' ? capitalise(activity[0]) : name, status: 'done', sets: [set] },
      problem: minutes === null ? 'Add how long it took, e.g. "30 min".' : null,
    };
  }
  return null;
}

/**
 * Return one set of a counted bodyweight movement ("20 pushups"), or null for anything else.
 */
function readCounted(body: string): ParseResult | null {
  const counted = COUNTED.exec(body);
  if (counted === null) {
    return null;
  }
  const set: WorkoutSet = { reps: Number(counted[1]), load: null, loadUnit: null, perHand: false, minutes: null, distanceKm: null };
  return { kind: 'workout', draft: { movement: capitalise(counted[2]!), status: 'done', sets: [set] }, problem: null };
}

/**
 * Return any exercise typed with a duration ("planks for 5 min", "30 min gym"), or null without one.
 *
 * Minutes and hours are never a food amount, so a duration marks training. The name is
 * whatever was typed around it, and a bare duration is not read at all.
 */
function readTimed(body: string, foods: readonly FoodVersion[]): ParseResult | null {
  const minutesMatch = ACTIVITY_MINUTES.exec(body);
  const hoursMatch = minutesMatch === null ? ACTIVITY_HOURS.exec(body) : null;
  const duration = minutesMatch ?? hoursMatch;
  if (duration === null) {
    return null;
  }

  // Ignore a saved food or a bare duration, because neither names an exercise
  const name = body.replace(duration[0], ' ').replace(DURATION_FILLER, ' ').replace(/\s+/g, ' ').trim();
  if (name === '' || !/^[a-z][a-z\s'-]*$/.test(name) || findFoods(name, foods).length > 0) {
    return null;
  }
  const minutes = minutesMatch !== null ? Number(minutesMatch[1]) : Number(hoursMatch![1]) * 60;
  const set: WorkoutSet = { reps: null, load: null, loadUnit: null, perHand: false, minutes, distanceKm: null };
  return { kind: 'workout', draft: { movement: capitalise(name), status: 'done', sets: [set] }, problem: null };
}

/**
 * Return the load unit for a typed word ("kgs" → kg, "pounds" → lb).
 */
function loadUnit(word: string): LoadUnit {
  return word.startsWith('k') ? 'kg' : 'lb';
}

/**
 * Return text with its first letter in capitals ("row" → "Row").
 */
function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
