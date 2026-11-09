/**
 * Estimate the energy used walking or running, from time, distance and body weight.
 *
 * These are the ACSM metabolic equations for flat ground. A machine's own figure often
 * assumes a default body, which is why the person's weight is required here: with no
 * weight there is no estimate, because unknown is not zero.
 */
import type { WorkoutEntry, WorkoutSet } from './workouts';

// Oxygen used per metre travelled, per kilogram (mL/kg/m), walking and running
const WALK_COST = 0.1;
const RUN_COST = 0.2;
// Oxygen used at rest (mL/kg/min)
const REST_OXYGEN = 3.5;
// Energy from one litre of oxygen (kcal)
const KCAL_PER_LITRE = 5;
// The walking equation holds up to about this speed (3.7 mph)
const CLEARLY_WALKING_KMH = 6;
// The running equation holds from about this speed (5 mph)
const CLEARLY_RUNNING_KMH = 8;
// A deliberately wide band either side of one equation, not a measured error
const ESTIMATE_SPREAD = 0.15;
// Words in a movement name that say which equation applies
const RUNNING_WORDS = /\b(run|ran|jog)/;
const WALKING_WORDS = /\b(walk|hike)/;
const TREADMILL_WORDS = /\btreadmill/;

/** An energy estimate in kcal, always a range. */
export interface BurnEstimate {
  low: number;
  high: number;
}

type Pace = 'walk' | 'run' | 'either';

/** Return kcal for one pace: oxygen per kg per minute, scaled by weight and time. */
function kcalAt(cost: number, metresPerMinute: number, weightKg: number, minutes: number): number {
  return (cost * metresPerMinute + REST_OXYGEN) * weightKg / 1000 * KCAL_PER_LITRE * minutes;
}

/** Return which equation fits a movement, or null if neither is meant for it. */
function paceOf(movement: string, kmPerHour: number): Pace | null {
  const name = movement.toLowerCase();
  if (RUNNING_WORDS.test(name)) return 'run';
  if (WALKING_WORDS.test(name)) return 'walk';

  // A treadmill could be either, so the speed decides, and the middle stays honest
  if (!TREADMILL_WORDS.test(name)) return null;
  if (kmPerHour <= CLEARLY_WALKING_KMH) return 'walk';
  return kmPerHour >= CLEARLY_RUNNING_KMH ? 'run' : 'either';
}

/** Return the estimate for one timed set, or null if a needed fact is missing. */
function burnOfSet(movement: string, set: WorkoutSet, weightKg: number): BurnEstimate | null {
  // Ignore a set without both time and distance, because speed cannot be worked out
  if (set.minutes === null || set.distanceKm === null || set.minutes <= 0 || set.distanceKm <= 0) {
    return null;
  }
  const metresPerMinute = (set.distanceKm * 1000) / set.minutes;
  const pace = paceOf(movement, (metresPerMinute * 60) / 1000);
  if (pace === null) {
    return null;
  }

  // In the middle speeds the true cost lies between the two equations, so report both
  if (pace === 'either') {
    return { low: kcalAt(WALK_COST, metresPerMinute, weightKg, set.minutes), high: kcalAt(RUN_COST, metresPerMinute, weightKg, set.minutes) };
  }
  const kcal = kcalAt(pace === 'run' ? RUN_COST : WALK_COST, metresPerMinute, weightKg, set.minutes);
  return { low: kcal * (1 - ESTIMATE_SPREAD), high: kcal * (1 + ESTIMATE_SPREAD) };
}

/**
 * Return the estimated energy used in a session, or null if it cannot be worked out.
 *
 * Null means unknown: no body weight, a set missing time or distance, or an activity
 * these equations do not cover, such as cycling.
 */
export function cardioBurn(entry: Pick<WorkoutEntry, 'movement' | 'status' | 'sets'>, weightKg: number | null): BurnEstimate | null {
  if (weightKg === null || entry.status !== 'done' || entry.sets.length === 0) {
    return null;
  }

  // One unknown set makes the whole session unknown, rather than quietly under-counting it
  const estimates = entry.sets.map(set => burnOfSet(entry.movement, set, weightKg));
  if (estimates.some(estimate => estimate === null)) {
    return null;
  }
  return (estimates as BurnEstimate[]).reduce((total, estimate) => ({ low: total.low + estimate.low, high: total.high + estimate.high }), { low: 0, high: 0 });
}
